'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { RubricField } from '@/types/database'

interface CreateTaskModalProps {
  userId: string
  onClose: () => void
  onSuccess: () => void
}

interface TaskJson {
  title: string
  description?: string
  deadline?: string
  status?: string
}

interface RubricJson {
  name: string
  description?: string
  fields: RubricField[]
}

export default function CreateTaskModal({ userId, onClose, onSuccess }: CreateTaskModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Task JSON
  const [taskJson, setTaskJson] = useState('')
  const [taskFile, setTaskFile] = useState<File | null>(null)

  // Rubric JSON
  const [rubricJson, setRubricJson] = useState('')
  const [rubricFile, setRubricFile] = useState<File | null>(null)

  // Artifacts
  const [artifactFiles, setArtifactFiles] = useState<File[]>([])

  const supabase = createClient()

  const handleTaskFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setTaskFile(file)
    try {
      const text = await file.text()
      setTaskJson(text)
      setError(null)
    } catch (err) {
      setError('Failed to read task JSON file')
    }
  }

  const handleRubricFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setRubricFile(file)
    try {
      const text = await file.text()
      setRubricJson(text)
      setError(null)
    } catch (err) {
      setError('Failed to read rubric JSON file')
    }
  }

  const handleArtifactFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setArtifactFiles(Array.from(e.target.files))
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      // Parse and validate task JSON
      if (!taskJson.trim()) {
        throw new Error('Task JSON is required')
      }

      let taskData: TaskJson
      try {
        taskData = JSON.parse(taskJson)
      } catch (err) {
        throw new Error('Invalid task JSON format')
      }

      if (!taskData.title) {
        throw new Error('Task JSON must include a "title" field')
      }

      // Parse and validate rubric JSON
      if (!rubricJson.trim()) {
        throw new Error('Rubric JSON is required')
      }

      let rubricData: RubricJson
      try {
        rubricData = JSON.parse(rubricJson)
      } catch (err) {
        throw new Error('Invalid rubric JSON format')
      }

      if (!rubricData.name) {
        throw new Error('Rubric JSON must include a "name" field')
      }

      if (!rubricData.fields || !Array.isArray(rubricData.fields) || rubricData.fields.length === 0) {
        throw new Error('Rubric JSON must include a "fields" array with at least one field')
      }

      // 1. Create the task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: taskData.title,
          description: taskData.description || '',
          deadline: taskData.deadline || null,
          created_by: userId,
          status: 'draft',
        })
        .select()
        .single()

      if (taskError) throw taskError

      // 2. Upload task JSON to storage
      if (taskFile) {
        const fileName = `tasks/${task.id}/task.json`
        await supabase.storage.from('artifacts').upload(fileName, taskFile)
      }

      // 3. Upload rubric JSON to storage
      if (rubricFile) {
        const fileName = `tasks/${task.id}/rubric.json`
        await supabase.storage.from('artifacts').upload(fileName, rubricFile)
      }

      // 4. Create the rubric
      const { error: rubricError } = await supabase
        .from('rubrics')
        .insert({
          task_id: task.id,
          name: rubricData.name,
          description: rubricData.description || '',
          schema: { fields: rubricData.fields },
        })

      if (rubricError) throw rubricError

      // 5. Upload artifacts
      for (const file of artifactFiles) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${task.id}/${Date.now()}_${file.name}`

        const { error: uploadError } = await supabase.storage
          .from('artifacts')
          .upload(fileName, file)

        if (uploadError) throw uploadError

        // Save artifact record
        const { error: artifactError } = await supabase
          .from('artifacts')
          .insert({
            task_id: task.id,
            file_name: file.name,
            file_type: fileExt || 'unknown',
            file_size: file.size,
            storage_path: fileName,
            uploaded_by: userId,
          })

        if (artifactError) throw artifactError
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Create New Task</h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload or paste JSON for task and rubric, then upload artifact files
          </p>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Task JSON Section */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">1. Task JSON</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload JSON File
                </label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleTaskFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                />
                {taskFile && (
                  <p className="text-xs text-green-700 mt-1">✓ Loaded: {taskFile.name}</p>
                )}
              </div>

              <div className="text-center text-gray-500 text-sm">OR</div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paste JSON
                </label>
                <textarea
                  value={taskJson}
                  onChange={(e) => setTaskJson(e.target.value)}
                  rows={6}
                  placeholder={`{\n  "title": "Review Financial Report",\n  "description": "Analyze the report...",\n  "deadline": "2024-12-31T23:59:59Z"\n}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Rubric JSON Section */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">2. Rubric JSON</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload JSON File
                </label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRubricFileUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                />
                {rubricFile && (
                  <p className="text-xs text-green-700 mt-1">✓ Loaded: {rubricFile.name}</p>
                )}
              </div>

              <div className="text-center text-gray-500 text-sm">OR</div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paste JSON
                </label>
                <textarea
                  value={rubricJson}
                  onChange={(e) => setRubricJson(e.target.value)}
                  rows={8}
                  placeholder={`{\n  "name": "Review Rubric",\n  "description": "Evaluation criteria...",\n  "fields": [\n    {\n      "id": "rating",\n      "label": "Quality Rating",\n      "type": "rating",\n      "required": true\n    }\n  ]\n}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Artifacts Section */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">3. Artifact Files</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Files (PDF, Excel)
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv"
                onChange={handleArtifactFilesChange}
                className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm"
              />
            </div>

            {artifactFiles.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Selected files:</p>
                <ul className="space-y-1">
                  {artifactFiles.map((file, index) => (
                    <li key={index} className="text-sm text-gray-600 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      {file.name} ({(file.size / 1024).toFixed(2)} KB)
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Help Section */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-900 font-medium mb-2">
              📖 JSON Format Reference
            </p>
            <p className="text-xs text-blue-800">
              See <code className="bg-blue-100 px-1 py-0.5 rounded">examples/task-example.json</code> and{' '}
              <code className="bg-blue-100 px-1 py-0.5 rounded">examples/rubric-example.json</code>{' '}
              for complete format documentation.
            </p>
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
            {loading ? 'Creating Task...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}
