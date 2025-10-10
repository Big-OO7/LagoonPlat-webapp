'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { BulkTaskUpload, TaskDefinition } from '@/types/database'

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

  const supabase = createClient()

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
      } catch (err) {
        throw new Error('Invalid JSON format. Please check your syntax.')
      }

      // Validate structure
      if (!bulkData.tasks || !Array.isArray(bulkData.tasks)) {
        throw new Error('JSON must contain a "tasks" array')
      }

      if (bulkData.tasks.length === 0) {
        throw new Error('At least one task is required')
      }

      // Validate each task
      bulkData.tasks.forEach((task, index) => {
        if (!task.name) {
          throw new Error(`Task ${index + 1}: "name" is required`)
        }
        if (!task.prompt) {
          throw new Error(`Task ${index + 1}: "prompt" is required`)
        }
        if (!task.graders || !Array.isArray(task.graders) || task.graders.length === 0) {
          throw new Error(`Task ${index + 1}: At least one grader is required`)
        }
      })

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
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Uploading Tasks...' : 'Upload Tasks'}
          </button>
        </div>
      </div>
    </div>
  )
}
