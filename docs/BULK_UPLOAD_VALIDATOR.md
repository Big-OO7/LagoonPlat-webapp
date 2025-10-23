# Bulk Task Upload Validator - Developer Guide

## Overview

The Bulk Task Upload Validator is a comprehensive JSON validation system that ensures task data uploaded by admins meets the required schema before being inserted into the database. It provides real-time feedback, detailed error messages, and prevents invalid data from entering the system.

## Table of Contents

1. [Architecture](#architecture)
2. [File Structure](#file-structure)
3. [How It Works](#how-it-works)
4. [Validator Logic](#validator-logic)
5. [Adding New Validation Rules](#adding-new-validation-rules)
6. [Customizing the UI](#customizing-the-ui)
7. [Testing](#testing)
8. [Common Scenarios](#common-scenarios)

---

## Architecture

### High-Level Flow

```
User Types JSON → Debounce (500ms) → Parse JSON → Validate Schema → Display Results → Enable/Disable Upload
```

### Components

1. **Validator** (`src/lib/taskValidator.ts`) - Core validation logic
2. **UI Component** (`src/components/admin/CreateTaskModal.tsx`) - Upload interface with real-time feedback
3. **Type Definitions** (`src/types/database.ts`) - TypeScript types for tasks and graders

---

## File Structure

```
src/
├── lib/
│   └── taskValidator.ts          # Core validation logic
├── components/
│   └── admin/
│       └── CreateTaskModal.tsx   # Bulk upload UI with validation
├── types/
│   └── database.ts               # Type definitions
└── docs/
    └── BULK_UPLOAD_VALIDATOR.md  # This file
```

---

## How It Works

### 1. Real-Time Validation

The validator uses React's `useEffect` with a 500ms debounce to validate JSON as the user types:

```typescript
useEffect(() => {
  if (!bulkJson.trim()) {
    setValidationResult(null)
    setJsonParseError(null)
    return
  }

  const timeoutId = setTimeout(() => {
    try {
      const parsed = JSON.parse(bulkJson)
      const result = validateTaskJSON(parsed, { strict: false })
      setValidationResult(result)
      setJsonParseError(null)
    } catch (e) {
      setValidationResult(null)
      setJsonParseError(e instanceof Error ? e.message : 'Invalid JSON syntax')
    }
  }, 500)

  return () => clearTimeout(timeoutId)
}, [bulkJson])
```

### 2. Validation States

The system has 4 distinct states:

| State | UI Indicator | Upload Button |
|-------|-------------|---------------|
| Empty | No banner | Disabled |
| Validating | Yellow banner with spinner | Disabled |
| Valid | Green banner with checkmark | **Enabled** |
| Invalid | Red banner with error count | Disabled |

### 3. Upload Prevention

The upload button is disabled unless ALL conditions are met:

```typescript
disabled={
  loading ||
  !bulkJson.trim() ||          // Empty
  !!jsonParseError ||           // JSON syntax error
  !validationResult ||          // No validation result
  !validationResult.isValid     // Validation failed
}
```

---

## Validator Logic

### Entry Point

The main validation function in `src/lib/taskValidator.ts`:

```typescript
export function validateTaskJSON(
  data: any,
  options: ValidationOptions = {}
): ValidationResult
```

**Parameters:**
- `data` - The parsed JSON object to validate
- `options.strict` - If true, treats warnings as errors (default: false)

**Returns:**
```typescript
{
  isValid: boolean,
  issues: ValidationIssue[],
  taskCount: number,
  graderCount: number,
  criticalCount: number,
  errorCount: number,
  warningCount: number
}
```

### Validation Hierarchy

```
validateTaskJSON()
  └── validateTask()         # For each task
      └── validateGrader()   # For each grader
          └── validateXmlGraderConfig()  # If grader type is 'xml'
              └── validateXmlStructureItem()  # For each structure field
                  └── validateComparator()    # If comparator exists
                      └── Type-specific validators:
                          - validateEqualsComparator()
                          - validateToleranceComparator()
                          - validateRangeComparator()
                          - validateContainsComparator()
                          - validateRegexComparator()
                          - validateInListComparator()
                          - validateLengthComparator()
```

### Severity Levels

| Severity | Meaning | Blocks Upload |
|----------|---------|---------------|
| **CRITICAL** | Missing required fields, invalid structure | ✅ Yes |
| **ERROR** | Type mismatches, invalid values | ✅ Yes |
| **WARNING** | Missing recommended fields | ❌ No (unless strict mode) |
| **INFO** | Helpful suggestions | ❌ No |

### Valid Values

The validator enforces these constants:

```typescript
const VALID_GRADER_TYPES = new Set(['xml', 'bash'])
const VALID_FIELD_TYPES = new Set(['int', 'float', 'string', 'bool'])
const VALID_COMPARATOR_TYPES = new Set([
  'equals',
  'tolerance',
  'range',
  'contains',
  'regex',
  'in_list',
  'length'
])
const VALID_TOLERANCE_TYPES = new Set(['absolute', 'percentage'])
```

---

## Adding New Validation Rules

### Example 1: Add a New Grader Type

To add support for a new grader type called `"python"`:

**Step 1:** Update valid types constant

```typescript
// src/lib/taskValidator.ts
const VALID_GRADER_TYPES = new Set(['xml', 'bash', 'python'])
```

**Step 2:** Add type-specific validation

```typescript
// In validateGrader() function, add:
if (graderType === 'python') {
  issues.push(...validatePythonGraderConfig(grader.config, taskName, graderName))
}
```

**Step 3:** Implement validator function

```typescript
function validatePythonGraderConfig(
  config: any,
  taskName: string,
  graderName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const path = `Task '${taskName}' > Grader '${graderName}' (python)`

  // Required: script
  if (!('script' in config)) {
    issues.push({
      severity: 'CRITICAL',
      path: `${path}.config`,
      message: 'Missing required field: script'
    })
  } else if (typeof config.script !== 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.script`,
      message: 'Field "script" must be a string'
    })
  }

  // Optional: timeout
  if ('timeout' in config && typeof config.timeout !== 'number') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.timeout`,
      message: 'Field "timeout" must be a number'
    })
  }

  return issues
}
```

### Example 2: Add a New Comparator Type

To add a new comparator called `"starts_with"`:

**Step 1:** Update valid types

```typescript
const VALID_COMPARATOR_TYPES = new Set([
  'equals',
  'tolerance',
  'range',
  'contains',
  'regex',
  'in_list',
  'length',
  'starts_with'  // Add here
])
```

**Step 2:** Add case in validateComparator()

```typescript
// In validateComparator() switch statement:
switch (compType) {
  case 'equals':
    issues.push(...validateEqualsComparator(config, itemType, compPath, itemName))
    break
  // ... other cases ...
  case 'starts_with':
    issues.push(...validateStartsWithComparator(config, compPath, itemName))
    break
}
```

**Step 3:** Implement validator

```typescript
function validateStartsWithComparator(
  config: any,
  path: string,
  itemName: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!('prefix' in config)) {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config`,
      message: 'Missing required field: prefix'
    })
    return issues
  }

  if (typeof config.prefix !== 'string') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.prefix`,
      message: `Field "prefix" must be a string, got ${typeof config.prefix}`
    })
  }

  if ('case_sensitive' in config && typeof config.case_sensitive !== 'boolean') {
    issues.push({
      severity: 'ERROR',
      path: `${path}.config.case_sensitive`,
      message: 'Field "case_sensitive" must be a boolean'
    })
  }

  return issues
}
```

### Example 3: Add a Warning for Best Practices

To warn users if a task has no description:

```typescript
// In validateTask() function, after checking required fields:
if (!('description' in task) || !task.description?.trim()) {
  issues.push({
    severity: 'WARNING',
    path: `${path} (${taskName})`,
    message: 'Recommended: Add a description to help labelers understand the task'
  })
}
```

---

## Customizing the UI

### Change Validation Debounce Timing

To change from 500ms to 1000ms:

```typescript
// src/components/admin/CreateTaskModal.tsx
const timeoutId = setTimeout(() => {
  // validation logic
}, 1000) // Changed from 500
```

### Customize Status Banner Colors

```typescript
// In CreateTaskModal.tsx, find the status banner:
<div className={`border-2 rounded-lg p-3 ${
  jsonParseError
    ? 'bg-red-50 border-red-400'      // Change red shades here
    : validationResult === null
    ? 'bg-yellow-50 border-yellow-400' // Change yellow shades here
    : validationResult.isValid
    ? 'bg-green-50 border-green-400'   // Change green shades here
    : 'bg-red-50 border-red-400'
}`}>
```

### Change Maximum Issues Displayed

By default, all issues are shown. To limit to 10:

```typescript
// In CreateTaskModal.tsx, modify the issues list:
{validationResult.issues.slice(0, 10).map((issue, idx) => (
  // issue display code
))}
{validationResult.issues.length > 10 && (
  <p className="text-sm text-gray-600 text-center">
    ...and {validationResult.issues.length - 10} more issue(s)
  </p>
)}
```

### Add Sound Alert for Validation Failure

```typescript
// In CreateTaskModal.tsx useEffect:
useEffect(() => {
  if (!bulkJson.trim()) {
    setValidationResult(null)
    setJsonParseError(null)
    return
  }

  const timeoutId = setTimeout(() => {
    try {
      const parsed = JSON.parse(bulkJson)
      const result = validateTaskJSON(parsed, { strict: false })
      setValidationResult(result)
      setJsonParseError(null)

      // Add sound alert
      if (!result.isValid) {
        const audio = new Audio('/sounds/error.mp3')
        audio.play().catch(() => {}) // Ignore if sound fails
      }
    } catch (e) {
      setValidationResult(null)
      setJsonParseError(e instanceof Error ? e.message : 'Invalid JSON syntax')

      // Sound for parse error
      const audio = new Audio('/sounds/error.mp3')
      audio.play().catch(() => {})
    }
  }, 500)

  return () => clearTimeout(timeoutId)
}, [bulkJson])
```

---

## Testing

### Manual Testing Checklist

#### 1. Empty State
- [ ] Upload button is disabled when textarea is empty
- [ ] No validation banner shown
- [ ] Tooltip says "Please provide JSON to upload"

#### 2. JSON Syntax Errors
- [ ] Paste invalid JSON (e.g., missing closing brace)
- [ ] Red banner appears: "JSON Syntax Error - Cannot Upload"
- [ ] Error message shows parse error
- [ ] Upload button is disabled

#### 3. Valid JSON, Invalid Schema
- [ ] Paste JSON with missing required field (e.g., no "name")
- [ ] Yellow "Validating..." appears briefly
- [ ] Red banner appears: "Validation Failed - Fix X Issue(s)"
- [ ] Issues list shows all problems with severity badges
- [ ] Upload button is disabled

#### 4. Valid JSON and Schema
- [ ] Paste valid task JSON
- [ ] Green banner appears: "✓ Ready to Upload"
- [ ] Upload button is enabled
- [ ] Can successfully upload

#### 5. Real-Time Validation
- [ ] Start typing JSON
- [ ] Validation runs after 500ms pause
- [ ] Status updates as you fix errors
- [ ] Button enables when all errors fixed

### Test Cases

#### Test Case 1: Missing Required Field

**Input:**
```json
{
  "tasks": [
    {
      "description": "Test task",
      "graders": []
    }
  ]
}
```

**Expected:**
- ❌ CRITICAL: Missing required field: name
- ❌ CRITICAL: Missing required field: prompt
- ❌ ERROR: Field "graders" must be non-empty array

#### Test Case 2: Type Mismatch

**Input:**
```json
{
  "tasks": [
    {
      "name": "Test",
      "prompt": "Question",
      "graders": [
        {
          "type": "xml",
          "name": "Grader",
          "weight": "1",
          "config": {
            "structure": []
          }
        }
      ]
    }
  ]
}
```

**Expected:**
- ❌ ERROR: Field "weight" must be a number, got string
- ❌ ERROR: Field "structure" must be non-empty array

#### Test Case 3: Invalid Grader Type

**Input:**
```json
{
  "tasks": [
    {
      "name": "Test",
      "prompt": "Question",
      "graders": [
        {
          "type": "python",
          "name": "Grader",
          "weight": 1,
          "config": {}
        }
      ]
    }
  ]
}
```

**Expected:**
- ❌ ERROR: Invalid grader type "python". Must be one of: xml, bash

### Automated Testing (Future)

To add unit tests for the validator:

```typescript
// src/lib/__tests__/taskValidator.test.ts
import { validateTaskJSON } from '../taskValidator'

describe('taskValidator', () => {
  it('should reject tasks without name', () => {
    const data = {
      tasks: [{
        prompt: "Test",
        graders: []
      }]
    }

    const result = validateTaskJSON(data)
    expect(result.isValid).toBe(false)
    expect(result.criticalCount).toBeGreaterThan(0)
    expect(result.issues.some(i => i.message.includes('name'))).toBe(true)
  })

  it('should accept valid task', () => {
    const data = {
      tasks: [{
        name: "Test Task",
        prompt: "Test prompt",
        graders: [{
          type: "xml",
          name: "Grader",
          weight: 1,
          config: {
            structure: [{
              id: "field1",
              name: "field1",
              type: "string",
              weight: 1,
              children: [],
              isExpanded: false,
              comparator: {
                type: "equals",
                config: { expected: "test" }
              }
            }]
          }
        }]
      }]
    }

    const result = validateTaskJSON(data)
    expect(result.isValid).toBe(true)
    expect(result.criticalCount).toBe(0)
    expect(result.errorCount).toBe(0)
  })
})
```

---

## Common Scenarios

### Scenario 1: Allow Warnings But Block Errors

By default, warnings don't block upload. This is controlled in `CreateTaskModal.tsx`:

```typescript
disabled={
  loading ||
  !bulkJson.trim() ||
  !!jsonParseError ||
  !validationResult ||
  !validationResult.isValid  // isValid is false only for CRITICAL/ERROR
}
```

To also block on warnings, change validation call to:

```typescript
const result = validateTaskJSON(parsed, { strict: true })
```

### Scenario 2: Add Custom Validation for Business Rules

Add business-specific validation in `validateTask()`:

```typescript
// In validateTask() function:

// Check if task name is unique (requires passing existing tasks)
if (existingTaskNames && existingTaskNames.includes(task.name)) {
  issues.push({
    severity: 'WARNING',
    path: `${path}.name`,
    message: `Task name "${task.name}" already exists. Consider using a unique name.`
  })
}

// Check if deadline is in the future
if (task.deadline) {
  const deadline = new Date(task.deadline)
  if (deadline < new Date()) {
    issues.push({
      severity: 'WARNING',
      path: `${path}.deadline`,
      message: 'Deadline is in the past'
    })
  }
}
```

### Scenario 3: Export Validation Report

To allow admins to download a validation report:

```typescript
// In CreateTaskModal.tsx:
const downloadValidationReport = () => {
  if (!validationResult) return

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      taskCount: validationResult.taskCount,
      graderCount: validationResult.graderCount,
      isValid: validationResult.isValid,
      criticalCount: validationResult.criticalCount,
      errorCount: validationResult.errorCount,
      warningCount: validationResult.warningCount
    },
    issues: validationResult.issues
  }

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `validation-report-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

// Add button in UI:
<button onClick={downloadValidationReport}>
  Download Validation Report
</button>
```

### Scenario 4: Validate from CLI/API

To use the validator outside the UI:

```typescript
// scripts/validate-tasks.ts
import * as fs from 'fs'
import { validateTaskJSON } from '../src/lib/taskValidator'

const jsonFile = process.argv[2]
if (!jsonFile) {
  console.error('Usage: npm run validate-tasks <file.json>')
  process.exit(1)
}

const content = fs.readFileSync(jsonFile, 'utf-8')
const data = JSON.parse(content)
const result = validateTaskJSON(data, { strict: false })

console.log('Validation Results:')
console.log('===================')
console.log(`Valid: ${result.isValid}`)
console.log(`Tasks: ${result.taskCount}`)
console.log(`Graders: ${result.graderCount}`)
console.log(`Critical: ${result.criticalCount}`)
console.log(`Errors: ${result.errorCount}`)
console.log(`Warnings: ${result.warningCount}`)
console.log('')

if (result.issues.length > 0) {
  console.log('Issues:')
  result.issues.forEach((issue, idx) => {
    console.log(`${idx + 1}. [${issue.severity}] ${issue.path}`)
    console.log(`   ${issue.message}`)
  })
}

process.exit(result.isValid ? 0 : 1)
```

```json
// package.json
{
  "scripts": {
    "validate-tasks": "ts-node scripts/validate-tasks.ts"
  }
}
```

Usage:
```bash
npm run validate-tasks tasks-export.json
```

---

## Troubleshooting

### Issue: Validation is too slow

**Solution:** Increase debounce time or optimize validation logic

```typescript
// Increase debounce from 500ms to 1000ms
setTimeout(() => { /* ... */ }, 1000)

// Or add early exit for large files
if (bulkJson.length > 100000) {
  setJsonParseError('File too large. Please upload files under 100KB.')
  return
}
```

### Issue: Upload button not enabling despite valid JSON

**Debug steps:**
1. Check browser console for errors
2. Verify `validationResult.isValid === true`
3. Check disabled condition:
```typescript
console.log({
  loading,
  bulkJson: bulkJson.trim(),
  jsonParseError,
  validationResult,
  isValid: validationResult?.isValid
})
```

### Issue: ESLint errors with `any` types

The validator uses `any` types intentionally for flexibility. Disable for this file:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
```

---

## Best Practices

1. **Always validate on the server too** - Client-side validation can be bypassed
2. **Keep error messages user-friendly** - Avoid technical jargon
3. **Use WARNING for recommendations** - Only ERROR/CRITICAL for blockers
4. **Test with real data** - Use actual exported task JSON for testing
5. **Version your schema** - Add version field for backward compatibility
6. **Log validation failures** - Track what errors users encounter most

---

## Additional Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React useEffect Hook](https://react.dev/reference/react/useEffect)
- [JSON Schema Validation](https://json-schema.org/)
- [Supabase Documentation](https://supabase.com/docs)

---

## Support

For questions or issues:
- Check the troubleshooting section above
- Review test cases for examples
- Consult the source code comments in `taskValidator.ts`

**Last Updated:** October 2025
