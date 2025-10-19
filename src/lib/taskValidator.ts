/**
 * Comprehensive Task JSON Validator
 * Validates task JSON files against the neoforge export schema.
 * Ported from junk/lint_json.py with full feature parity.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

export interface ValidationIssue {
  severity: 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO';
  path: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  taskCount: number;
  graderCount: number;
  criticalCount: number;
  errorCount: number;
  warningCount: number;
}

export interface ValidationOptions {
  strict?: boolean; // Treat warnings as errors
}

// Valid values based on neoforge schema
const VALID_GRADER_TYPES = new Set(['xml', 'bash']);
const VALID_FIELD_TYPES = new Set(['int', 'float', 'string', 'bool']);
const VALID_COMPARATOR_TYPES = new Set([
  'equals',
  'tolerance',
  'range',
  'contains',
  'regex',
  'in_list',
  'length'
]);
const VALID_TOLERANCE_TYPES = new Set(['absolute', 'percentage']);

/**
 * Main validation function
 */
export function validateTaskJSON(
  data: any,
  options: ValidationOptions = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];
  let taskCount = 0;
  let graderCount = 0;

  // Validate root structure
  if (!data || typeof data !== 'object') {
    issues.push({
      severity: 'CRITICAL',
      path: 'root',
      message: 'Root must be an object'
    });
    return buildResult(issues, 0, 0, options);
  }

  if (!('tasks' in data)) {
    issues.push({
      severity: 'CRITICAL',
      path: 'root',
      message: 'Missing required field: tasks'
    });
    return buildResult(issues, 0, 0, options);
  }

  if (!Array.isArray(data.tasks)) {
    issues.push({
      severity: 'CRITICAL',
      path: 'root',
      message: 'Field "tasks" must be an array'
    });
    return buildResult(issues, 0, 0, options);
  }

  // Validate each task
  taskCount = data.tasks.length;
  data.tasks.forEach((task: any, idx: number) => {
    const taskIssues = validateTask(task, idx);
    issues.push(...taskIssues);
    if (task.graders && Array.isArray(task.graders)) {
      graderCount += task.graders.length;
    }
  });

  return buildResult(issues, taskCount, graderCount, options);
}

function buildResult(
  issues: ValidationIssue[],
  taskCount: number,
  graderCount: number,
  options: ValidationOptions
): ValidationResult {
  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING').length;

  const isValid = options.strict
    ? criticalCount === 0 && errorCount === 0 && warningCount === 0
    : criticalCount === 0 && errorCount === 0;

  return {
    isValid,
    issues,
    taskCount,
    graderCount,
    criticalCount,
    errorCount,
    warningCount
  };
}

function validateTask(task: any, taskIdx: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `tasks[${taskIdx}]`;

  if (typeof task !== 'object' || task === null) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Task must be an object'
    });
    return issues;
  }

  const taskName = task.name || `Task ${taskIdx}`;

  // Required: name
  if (!('name' in task)) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Missing required field: name'
    });
  } else if (typeof task.name !== 'string' || !task.name.trim()) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.name`,
      message: 'Field "name" must be non-empty string'
    });
  }

  // Required: prompt
  if (!('prompt' in task)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path} (${taskName})`,
      message: 'Missing required field: prompt'
    });
  } else if (typeof task.prompt !== 'string' || !task.prompt.trim()) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.prompt`,
      message: 'Field "prompt" must be non-empty string'
    });
  }

  // Required: graders
  if (!('graders' in task)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path} (${taskName})`,
      message: 'Missing required field: graders'
    });
    return issues;
  }

  if (!Array.isArray(task.graders)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path}.graders`,
      message: 'Field "graders" must be an array'
    });
    return issues;
  }

  if (task.graders.length === 0) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.graders`,
      message: 'Field "graders" must be non-empty array'
    });
    return issues;
  }

  // Validate each grader
  task.graders.forEach((grader: any, gIdx: number) => {
    issues.push(...validateGrader(grader, taskName, gIdx));
  });

  return issues;
}

function validateGrader(
  grader: any,
  taskName: string,
  graderIdx: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `Task '${taskName}' > graders[${graderIdx}]`;

  if (typeof grader !== 'object' || grader === null) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Grader must be an object'
    });
    return issues;
  }

  // Required: type
  if (!('type' in grader)) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Missing required field: type'
    });
    return issues;
  }

  const graderType = grader.type;
  if (!VALID_GRADER_TYPES.has(graderType)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.type`,
      message: `Invalid grader type "${graderType}". Must be one of: ${Array.from(VALID_GRADER_TYPES).join(', ')}`
    });
    return issues;
  }

  // Required: name
  const graderName = grader.name || `Grader ${graderIdx}`;
  if (!('name' in grader)) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Missing required field: name'
    });
  } else if (typeof grader.name !== 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.name`,
      message: 'Field "name" must be a string'
    });
  }

  // Required: config
  if (!('config' in grader)) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Missing required field: config'
    });
    return issues;
  }

  if (typeof grader.config !== 'object' || grader.config === null) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path}.config`,
      message: 'Field "config" must be an object'
    });
    return issues;
  }

  // Required: weight
  if (!('weight' in grader)) {
    issues.push({
      severity: 'ERROR',
      path,
      message: 'Missing required field: weight'
    });
  } else if (typeof grader.weight !== 'number') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.weight`,
      message: `Field "weight" must be a number, got ${typeof grader.weight}`
    });
  }

  // Type-specific validation
  if (graderType === 'xml') {
    issues.push(...validateXmlGraderConfig(grader.config, taskName, graderName));
  }
  // Bash graders have no enforced config structure

  return issues;
}

function validateXmlGraderConfig(
  config: any,
  taskName: string,
  graderName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `Task '${taskName}' > Grader '${graderName}' (xml)`;

  // Required: structure
  if (!('structure' in config)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path}.config`,
      message: 'Missing required field: structure'
    });
    return issues;
  }

  if (!Array.isArray(config.structure)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path}.config.structure`,
      message: 'Field "structure" must be an array'
    });
    return issues;
  }

  if (config.structure.length === 0) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.structure`,
      message: 'Field "structure" must be non-empty array'
    });
    return issues;
  }

  // Optional: binary_mode
  if (!('binary_mode' in config)) {
    issues.push({
      severity: 'WARNING',
      path: `${path}.config`,
      message: 'Missing recommended field: binary_mode (will default to false)'
    });
  } else if (typeof config.binary_mode !== 'boolean') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.binary_mode`,
      message: 'Field "binary_mode" must be a boolean'
    });
  }

  // Validate structure items
  config.structure.forEach((item: any, idx: number) => {
    issues.push(...validateXmlStructureItem(item, taskName, graderName, `structure[${idx}]`));
  });

  return issues;
}

function validateXmlStructureItem(
  item: any,
  taskName: string,
  graderName: string,
  itemPath: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `Task '${taskName}' > Grader '${graderName}' > ${itemPath}`;

  if (typeof item !== 'object' || item === null) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Structure item must be an object'
    });
    return issues;
  }

  const itemName = item.name || `item at ${itemPath}`;

  // Required: id
  if (!('id' in item)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path} ('${itemName}')`,
      message: 'Missing required field: id'
    });
  } else if (typeof item.id !== 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.id`,
      message: 'Field "id" must be a string'
    });
  }

  // Required: name
  if (!('name' in item)) {
    issues.push({
      severity: 'CRITICAL',
      path,
      message: 'Missing required field: name'
    });
  } else if (typeof item.name !== 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.name`,
      message: 'Field "name" must be a string'
    });
  }

  // Required: type
  let itemType: string | null = null;
  if (!('type' in item)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path} ('${itemName}')`,
      message: 'Missing required field: type'
    });
  } else {
    itemType = item.type;
    if (itemType && !VALID_FIELD_TYPES.has(itemType)) {
      issues.push({
        severity: 'ERROR',
        path: `${path}.type`,
        message: `Invalid type "${itemType}". Must be one of: ${Array.from(VALID_FIELD_TYPES).join(', ')}`
      });
      itemType = null;
    }
  }

  // Required: children
  if (!('children' in item)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path} ('${itemName}')`,
      message: 'Missing required field: children'
    });
  } else if (!Array.isArray(item.children)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.children`,
      message: 'Field "children" must be an array'
    });
  } else {
    // Recursively validate children
    item.children.forEach((child: any, childIdx: number) => {
      issues.push(
        ...validateXmlStructureItem(
          child,
          taskName,
          graderName,
          `${itemPath}.children[${childIdx}]`
        )
      );
    });
  }

  // Required: isExpanded
  if (!('isExpanded' in item)) {
    issues.push({
      severity: 'ERROR',
      path: `${path} ('${itemName}')`,
      message: 'Missing required field: isExpanded'
    });
  } else if (typeof item.isExpanded !== 'boolean') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.isExpanded`,
      message: 'Field "isExpanded" must be a boolean'
    });
  }

  // Required: weight
  if (!('weight' in item)) {
    issues.push({
      severity: 'ERROR',
      path: `${path} ('${itemName}')`,
      message: 'Missing required field: weight'
    });
  } else if (typeof item.weight === 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.weight`,
      message: `Field "weight" is string "${item.weight}", should be number`
    });
  } else if (typeof item.weight !== 'number') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.weight`,
      message: `Field "weight" must be a number, got ${typeof item.weight}`
    });
  }

  // Optional: comparator
  if ('comparator' in item && itemType) {
    if (typeof item.comparator !== 'object' || item.comparator === null) {
      issues.push({
        severity: 'ERROR',
        path: `${path}.comparator`,
        message: 'Field "comparator" must be an object'
      });
    } else {
      issues.push(...validateComparator(item.comparator, itemType, path, itemName));
    }
  }

  return issues;
}

function validateComparator(
  comparator: any,
  itemType: string,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const compPath = `${path}.comparator`;

  // Required: type
  if (!('type' in comparator)) {
    issues.push({
      severity: 'ERROR',
      path: compPath,
      message: 'Missing required field: type'
    });
    return issues;
  }

  const compType = comparator.type;
  if (!VALID_COMPARATOR_TYPES.has(compType)) {
    issues.push({
      severity: 'ERROR',
      path: `${compPath}.type`,
      message: `Invalid comparator type "${compType}". Must be one of: ${Array.from(VALID_COMPARATOR_TYPES).join(', ')}`
    });
    return issues;
  }

  // Required: config
  if (!('config' in comparator)) {
    issues.push({
      severity: 'ERROR',
      path: compPath,
      message: 'Missing required field: config'
    });
    return issues;
  }

  const config = comparator.config;
  if (typeof config !== 'object' || config === null) {
    issues.push({
      severity: 'ERROR',
      path: `${compPath}.config`,
      message: 'Field "config" must be an object'
    });
    return issues;
  }

  // Type-specific validation
  switch (compType) {
    case 'equals':
      issues.push(...validateEqualsComparator(config, itemType, compPath, itemName));
      break;
    case 'tolerance':
      issues.push(...validateToleranceComparator(config, itemType, compPath, itemName));
      break;
    case 'range':
      issues.push(...validateRangeComparator(config, compPath, itemName));
      break;
    case 'contains':
      issues.push(...validateContainsComparator(config, compPath, itemName));
      break;
    case 'regex':
      issues.push(...validateRegexComparator(config, compPath, itemName));
      break;
    case 'in_list':
      issues.push(...validateInListComparator(config, compPath, itemName));
      break;
    case 'length':
      issues.push(...validateLengthComparator(config, compPath, itemName));
      break;
  }

  return issues;
}

function validateEqualsComparator(
  config: any,
  itemType: string,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!('expected' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: expected'
    });
    return issues;
  }

  const expected = config.expected;
  const expectedType = typeof expected;

  // Check type matching
  if (itemType === 'int') {
    if (expectedType !== 'number' || !Number.isInteger(expected)) {
      issues.push({
        severity: 'ERROR',
        path: `${path}.config.expected`,
        message: `Item type is "int" but expected is ${expectedType}. Must be integer number.`
      });
    }
  } else if (itemType === 'float') {
    if (expectedType !== 'number') {
      issues.push({
        severity: 'ERROR',
        path: `${path}.config.expected`,
        message: `Item type is "float" but expected is ${expectedType}. Must be number.`
      });
    }
  } else if (itemType === 'string') {
    if (expectedType !== 'string') {
      issues.push({
        severity: 'ERROR',
        path: `${path}.config.expected`,
        message: `Item type is "string" but expected is ${expectedType}. Must be string.`
      });
    }
  } else if (itemType === 'bool') {
    if (expectedType !== 'boolean') {
      issues.push({
        severity: 'ERROR',
        path: `${path}.config.expected`,
        message: `Item type is "bool" but expected is ${expectedType}. Must be boolean.`
      });
    }
  }

  return issues;
}

function validateToleranceComparator(
  config: any,
  itemType: string,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check expected
  if (!('expected' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: expected'
    });
  } else if (typeof config.expected !== 'number') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.expected`,
      message: `Field "expected" must be a number, got ${typeof config.expected}`
    });
  }

  // Check tolerance
  if (!('tolerance' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: tolerance'
    });
  } else if (typeof config.tolerance === 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.tolerance`,
      message: `Field "tolerance" is string "${config.tolerance}", should be number`
    });
  } else if (typeof config.tolerance !== 'number') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.tolerance`,
      message: `Field "tolerance" must be a number, got ${typeof config.tolerance}`
    });
  }

  // Check type (absolute or percentage)
  if (!('type' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: type'
    });
  } else if (!VALID_TOLERANCE_TYPES.has(config.type)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.type`,
      message: `Field "type" must be "absolute" or "percentage", got "${config.type}"`
    });
  }

  return issues;
}

function validateRangeComparator(
  config: any,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!('min' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: min'
    });
  } else if (typeof config.min !== 'number') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.min`,
      message: `Field "min" must be a number, got ${typeof config.min}`
    });
  }

  if (!('max' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: max'
    });
  } else if (typeof config.max !== 'number') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.max`,
      message: `Field "max" must be a number, got ${typeof config.max}`
    });
  }

  return issues;
}

function validateContainsComparator(
  config: any,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const hasSubstring = 'substring' in config;
  const hasExpected = 'expected' in config;

  if (!hasSubstring && !hasExpected) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: substring (or expected)'
    });
  }

  if (hasSubstring && typeof config.substring !== 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.substring`,
      message: `Field "substring" must be a string, got ${typeof config.substring}`
    });
  }

  if ('case_sensitive' in config && typeof config.case_sensitive !== 'boolean') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.case_sensitive`,
      message: 'Field "case_sensitive" must be a boolean'
    });
  }

  return issues;
}

function validateRegexComparator(
  config: any,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const hasPattern = 'pattern' in config;
  const hasExpected = 'expected' in config;

  if (!hasPattern && !hasExpected) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: pattern (or expected)'
    });
    return issues;
  }

  const pattern = config.pattern || config.expected;

  if (typeof pattern !== 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.pattern`,
      message: `Field "pattern" must be a string, got ${typeof pattern}`
    });
    return issues;
  }

  // Test regex compilation
  try {
    new RegExp(pattern);
  } catch (e) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.pattern`,
      message: `Invalid regex pattern: ${(e as Error).message}`
    });
  }

  return issues;
}

function validateInListComparator(
  config: any,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!('allowed_values' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: allowed_values'
    });
    return issues;
  }

  if (!Array.isArray(config.allowed_values)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.allowed_values`,
      message: 'Field "allowed_values" must be an array'
    });
    return issues;
  }

  if (config.allowed_values.length === 0) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.allowed_values`,
      message: 'Field "allowed_values" must be non-empty array'
    });
  }

  return issues;
}

function validateLengthComparator(
  config: any,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const hasMin = 'min_length' in config || 'min' in config;
  const hasMax = 'max_length' in config || 'max' in config;
  const hasExact = 'exact_length' in config || 'exact' in config;

  if (!hasMin && !hasMax && !hasExact) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Must have at least one of: min_length, max_length, exact_length'
    });
    return issues;
  }

  const fields = ['min_length', 'min', 'max_length', 'max', 'exact_length', 'exact'];
  fields.forEach(field => {
    if (field in config && !Number.isInteger(config[field])) {
      issues.push({
        severity: 'ERROR',
        path: `${path}.config.${field}`,
        message: `Field "${field}" must be an integer, got ${typeof config[field]}`
      });
    }
  });

  return issues;
}
