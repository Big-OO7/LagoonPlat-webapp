'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { BulkTaskUpload } from '@/types/database'
import { validateTaskJSON, type ValidationResult } from '@/lib/taskValidator'

interface CreateTaskModalProps {
  userId: string
  onClose: () => void
  onSuccess: () => void
}

export default function CreateTaskModal({ userId, onClose, onSuccess }: CreateTaskModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Bulk JSON upload
  const [bulkJson, setBulkJson] = useState('')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [jsonParseError, setJsonParseError] = useState<string | null>(null)

  const supabase = createClient()

  // Real-time validation with debounce
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
        // JSON parse error
        setValidationResult(null)
        setJsonParseError(e instanceof Error ? e.message : 'Invalid JSON syntax')
      }
    }, 500) // Debounce 500ms

    return () => clearTimeout(timeoutId)
  }, [bulkJson])

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Validate JSON input
      if (!bulkJson.trim()) {
        throw new Error('Please provide task JSON')
      }

      // Parse the bulk upload JSON
      let bulkData: BulkTaskUpload
      try {
        bulkData = JSON.parse(bulkJson)
      } catch {
        throw new Error('Invalid JSON format. Please check your syntax.')
      }

      // Run comprehensive validation
      const validation = validateTaskJSON(bulkData, { strict: false })

      if (!validation.isValid) {
        const criticalIssues = validation.issues.filter(i => i.severity === 'CRITICAL')
        const errorIssues = validation.issues.filter(i => i.severity === 'ERROR')

        if (criticalIssues.length > 0) {
          throw new Error(`Validation failed with ${criticalIssues.length} critical issue(s). Please fix them before uploading.`)
        }
        if (errorIssues.length > 0) {
          throw new Error(`Validation failed with ${errorIssues.length} error(s). Please fix them before uploading.`)
        }
      }

      // Insert all tasks
      const createdTasks: string[] = []

      for (const taskDef of bulkData.tasks) {
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            title: taskDef.name,
            description: taskDef.description || null,
            prompt: taskDef.prompt,
            graders: taskDef.graders,
            created_by: userId,
            status: 'draft',
          })
          .select()
          .single()

        if (taskError) {
          throw new Error(`Failed to create task "${taskDef.name}": ${taskError.message}`)
        }

        createdTasks.push(task.title)
      }

      setSuccessMessage(`Successfully created ${createdTasks.length} task(s): ${createdTasks.join(', ')}`)
      setBulkJson('')

      // Auto-close after 2 seconds
      setTimeout(() => {
        onSuccess()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const exampleJson = `{
  "tasks": [
    {
      "name": "Simple Math Task",
      "description": "Test basic arithmetic",
      "prompt": "What is 5 + 10?",
      "graders": [
        {
          "type": "xml",
          "name": "Math Grader",
          "config": {
            "structure": [
              {
                "id": "answer",
                "name": "answer",
                "type": "int",
                "weight": 1,
                "comparator": {
                  "type": "equals",
                  "config": {
                    "expected": 15
                  }
                }
              }
            ]
          },
          "weight": 1
        }
      ]
    }
  ]
}`

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Bulk Upload Tasks</h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload multiple tasks at once using JSON format
          </p>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
          )}

          {/* Validation Status Banner */}
          {bulkJson.trim() && (
            <div className={`border-2 rounded-lg p-3 ${
              jsonParseError
                ? 'bg-red-50 border-red-400'
                : validationResult === null
                ? 'bg-yellow-50 border-yellow-400'
                : validationResult.isValid
                ? 'bg-green-50 border-green-400'
                : 'bg-red-50 border-red-400'
            }`}>
              <div className="flex items-center gap-2">
                {jsonParseError ? (
                  <>
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="font-semibold text-red-900">JSON Syntax Error - Cannot Upload</span>
                  </>
                ) : validationResult === null ? (
                  <>
                    <svg className="w-5 h-5 text-yellow-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="font-semibold text-yellow-900">Validating...</span>
                  </>
                ) : validationResult.isValid ? (
                  <>
                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-semibold text-green-900">✓ Ready to Upload</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="font-semibold text-red-900">
                      Validation Failed - Fix {validationResult.criticalCount + validationResult.errorCount} Issue(s)
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Task JSON Input */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Paste Task JSON</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                JSON containing tasks array *
              </label>
              <textarea
                value={bulkJson}
                onChange={(e) => setBulkJson(e.target.value)}
                rows={15}
                placeholder={exampleJson}
                className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                Paste your JSON with a &quot;tasks&quot; array. Each task must have: name, prompt, and graders.
              </p>
            </div>
          </div>

          {/* JSON Parse Error */}
          {jsonParseError && (
            <div className="border-2 border-red-300 bg-red-50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-red-900">Invalid JSON Syntax</h3>
                  <p className="text-sm text-red-800 mt-1 font-mono">{jsonParseError}</p>
                  <p className="text-sm text-red-700 mt-2">Please fix the JSON syntax errors before validating the schema.</p>
                </div>
              </div>
            </div>
          )}

          {/* Validation Results */}
          {!jsonParseError && validationResult && (
            <div className={`border-2 rounded-lg p-4 ${
              validationResult.isValid
                ? 'bg-green-50 border-green-300'
                : validationResult.criticalCount > 0
                ? 'bg-red-50 border-red-300'
                : 'bg-orange-50 border-orange-300'
            }`}>
              <div className="flex items-start gap-3 mb-3">
                {validationResult.isValid ? (
                  <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                <div className="flex-1">
                  <h3 className={`text-base font-semibold ${
                    validationResult.isValid ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {validationResult.isValid ? '✓ Validation Passed' : '✗ Validation Failed'}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 bg-white rounded font-medium">
                      {validationResult.taskCount} task{validationResult.taskCount !== 1 ? 's' : ''}
                    </span>
                    <span className="px-2 py-1 bg-white rounded font-medium">
                      {validationResult.graderCount} grader{validationResult.graderCount !== 1 ? 's' : ''}
                    </span>
                    {validationResult.criticalCount > 0 && (
                      <span className="px-2 py-1 bg-red-600 text-white rounded font-medium">
                        {validationResult.criticalCount} CRITICAL
                      </span>
                    )}
                    {validationResult.errorCount > 0 && (
                      <span className="px-2 py-1 bg-orange-600 text-white rounded font-medium">
                        {validationResult.errorCount} ERROR{validationResult.errorCount !== 1 ? 'S' : ''}
                      </span>
                    )}
                    {validationResult.warningCount > 0 && (
                      <span className="px-2 py-1 bg-yellow-600 text-white rounded font-medium">
                        {validationResult.warningCount} WARNING{validationResult.warningCount !== 1 ? 'S' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Issues List */}
              {validationResult.issues.length > 0 && (
                <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                  {validationResult.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded text-sm ${
                        issue.severity === 'CRITICAL'
                          ? 'bg-red-100 border border-red-300'
                          : issue.severity === 'ERROR'
                          ? 'bg-orange-100 border border-orange-300'
                          : 'bg-yellow-100 border border-yellow-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${
                          issue.severity === 'CRITICAL'
                            ? 'bg-red-600 text-white'
                            : issue.severity === 'ERROR'
                            ? 'bg-orange-600 text-white'
                            : 'bg-yellow-600 text-white'
                        }`}>
                          {issue.severity}
                        </span>
                        <div className="flex-1">
                          <p className="font-mono text-xs text-gray-700 font-semibold">{issue.path}</p>
                          <p className="text-gray-800 mt-1">{issue.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Help Section */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-900 font-medium mb-2">
              📖 Format Example
            </p>
            <pre className="text-xs text-blue-800 bg-blue-100 p-3 rounded overflow-x-auto">
{`{
  "tasks": [
    {
      "name": "Task Name",
      "description": "Optional description",
      "prompt": "Question for labelers",
      "graders": [
        {
          "type": "xml",
          "name": "Grader Name",
          "config": { "structure": [...] },
          "weight": 1
        }
      ]
    }
  ]
}`}
            </pre>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              loading ||
              !bulkJson.trim() ||
              !!jsonParseError ||
              !validationResult ||
              !validationResult.isValid
            }
            title={
              !bulkJson.trim()
                ? 'Please provide JSON to upload'
                : jsonParseError
                ? 'Fix JSON syntax errors'
                : !validationResult
                ? 'Waiting for validation...'
                : !validationResult.isValid
                ? 'Fix validation errors before uploading'
                : ''
            }
          >
            {loading ? 'Uploading Tasks...' : 'Upload Tasks'}
          </button>
        </div>
      </div>
    </div>
  )
}
