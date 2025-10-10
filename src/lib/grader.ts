import type { GraderConfig, GraderStructureField } from '@/types/database'

interface GraderResult {
  graderName: string
  score: number
  maxScore: number
  passed: boolean
  details: Record<string, unknown>
}

interface EvaluationResult {
  totalScore: number
  maxScore: number
  percentageScore: number
  passed: boolean
  graderResults: GraderResult[]
}

/**
 * Evaluates a labeler's response against grader configurations
 */
export async function evaluateResponse(
  responseText: string,
  graders: GraderConfig[]
): Promise<EvaluationResult> {
  const graderResults: GraderResult[] = []
  let totalScore = 0
  let maxScore = 0

  for (const grader of graders) {
    const result = await evaluateWithGrader(responseText, grader)
    graderResults.push(result)
    totalScore += result.score
    maxScore += result.maxScore
  }

  return {
    totalScore,
    maxScore,
    percentageScore: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
    passed: totalScore === maxScore,
    graderResults,
  }
}

/**
 * Evaluates response with a single grader
 */
async function evaluateWithGrader(
  responseText: string,
  grader: GraderConfig
): Promise<GraderResult> {
  switch (grader.type) {
    case 'xml':
      return evaluateXmlGrader(responseText, grader)
    case 'json':
      return evaluateJsonGrader(responseText, grader)
    case 'text':
      return evaluateTextGrader(responseText, grader)
    case 'number':
      return evaluateNumberGrader(responseText, grader)
    default:
      throw new Error(`Unknown grader type: ${grader.type}`)
  }
}

/**
 * Evaluates XML-structured response
 */
function evaluateXmlGrader(responseText: string, grader: GraderConfig): GraderResult {
  const structure = grader.config.structure || []
  let score = 0
  const maxScore = structure.reduce((sum, field) => sum + field.weight, 0)
  const details: Record<string, unknown> = {}

  // Parse XML-like structure from response
  const parsedData = parseXmlLikeResponse(responseText)

  for (const field of structure) {
    const value = parsedData[field.name]
    const fieldPassed = evaluateField(value, field)

    details[field.name] = {
      expected: field.comparator.config.expected,
      actual: value,
      passed: fieldPassed,
      weight: field.weight,
    }

    if (fieldPassed) {
      score += field.weight
    }
  }

  return {
    graderName: grader.name,
    score,
    maxScore,
    passed: score === maxScore,
    details,
  }
}

/**
 * Evaluates JSON-structured response
 */
function evaluateJsonGrader(responseText: string, grader: GraderConfig): GraderResult {
  const structure = grader.config.structure || []
  let score = 0
  const maxScore = structure.reduce((sum, field) => sum + field.weight, 0)
  const details: Record<string, unknown> = {}

  try {
    const parsedData = JSON.parse(responseText)

    for (const field of structure) {
      const value = parsedData[field.name]
      const fieldPassed = evaluateField(value, field)

      details[field.name] = {
        expected: field.comparator.config.expected,
        actual: value,
        passed: fieldPassed,
        weight: field.weight,
      }

      if (fieldPassed) {
        score += field.weight
      }
    }
  } catch (error) {
    details.error = 'Invalid JSON format'
  }

  return {
    graderName: grader.name,
    score,
    maxScore,
    passed: score === maxScore,
    details,
  }
}

/**
 * Evaluates plain text response
 */
function evaluateTextGrader(responseText: string, grader: GraderConfig): GraderResult {
  const expected = grader.config.expected as string
  const passed = responseText.trim() === expected?.trim()

  return {
    graderName: grader.name,
    score: passed ? grader.weight : 0,
    maxScore: grader.weight,
    passed,
    details: {
      expected,
      actual: responseText,
    },
  }
}

/**
 * Evaluates numeric response
 */
function evaluateNumberGrader(responseText: string, grader: GraderConfig): GraderResult {
  const value = parseFloat(responseText.trim())
  const expected = grader.config.expected as number
  const passed = !isNaN(value) && value === expected

  return {
    graderName: grader.name,
    score: passed ? grader.weight : 0,
    maxScore: grader.weight,
    passed,
    details: {
      expected,
      actual: value,
    },
  }
}

/**
 * Evaluates a single field against its comparator
 */
function evaluateField(value: unknown, field: GraderStructureField): boolean {
  const { comparator } = field

  // Type conversion
  let typedValue: string | number | boolean
  switch (field.type) {
    case 'int':
      typedValue = parseInt(String(value), 10)
      break
    case 'float':
      typedValue = parseFloat(String(value))
      break
    case 'boolean':
      typedValue = String(value).toLowerCase() === 'true'
      break
    default:
      typedValue = String(value)
  }

  // Compare based on comparator type
  switch (comparator.type) {
    case 'equals':
      return typedValue === comparator.config.expected

    case 'contains':
      return String(typedValue).includes(String(comparator.config.expected))

    case 'range':
      if (typeof typedValue === 'number') {
        const min = comparator.config.min ?? -Infinity
        const max = comparator.config.max ?? Infinity
        return typedValue >= min && typedValue <= max
      }
      return false

    case 'regex':
      if (comparator.config.pattern) {
        const regex = new RegExp(comparator.config.pattern)
        return regex.test(String(typedValue))
      }
      return false

    default:
      return false
  }
}

/**
 * Parses XML-like response (simple key-value extraction)
 * Example: <answer>15</answer> -> { answer: "15" }
 * Also handles one level of nesting: <root><answer>15</answer></root> -> { answer: "15" }
 */
function parseXmlLikeResponse(responseText: string): Record<string, string> {
  const result: Record<string, string> = {}

  // Match <key>value</key> patterns
  const regex = /<(\w+)>(.*?)<\/\1>/gs
  let match

  while ((match = regex.exec(responseText)) !== null) {
    const [, key, value] = match
    const trimmedValue = value.trim()

    // Check if value contains nested XML tags
    if (trimmedValue.includes('<')) {
      // Parse nested tags recursively
      const nestedRegex = /<(\w+)>(.*?)<\/\1>/gs
      let nestedMatch
      while ((nestedMatch = nestedRegex.exec(trimmedValue)) !== null) {
        const [, nestedKey, nestedValue] = nestedMatch
        result[nestedKey] = nestedValue.trim()
      }
    } else {
      // Simple value, store directly
      result[key] = trimmedValue
    }
  }

  return result
}
