'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { RubricField, RubricFieldType } from '@/types/database'

interface CreateTaskModalProps {
  userId: string
  onClose: () => void
  onSuccess: () => void
}

export default function CreateTaskModal({ userId, onClose, onSuccess }: CreateTaskModalProps) {
  const [step, setStep] = useState<'basic' | 'rubric' | 'artifacts'>('basic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Basic task info
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')

  // Rubric fields
  const [rubricName, setRubricName] = useState('')
  const [rubricDescription, setRubricDescription] = useState('')
  const [rubricFields, setRubricFields] = useState<RubricField[]>([])

  // Artifacts
  const [files, setFiles] = useState<File[]>([])

  // JSON file uploads
  const [taskJsonFile, setTaskJsonFile] = useState<File | null>(null)
  const [rubricJsonFile, setRubricJsonFile] = useState<File | null>(null)

  const supabase = createClient()

  const addRubricField = () => {
    const newField: RubricField = {
      id: `field_${Date.now()}`,
      label: '',
      type: 'text',
      required: false,
    }
    setRubricFields([...rubricFields, newField])
  }

  const updateRubricField = (id: string, updates: Partial<RubricField>) => {
    setRubricFields(rubricFields.map(field =>
      field.id === id ? { ...field, ...updates } : field
    ))
  }

  const removeRubricField = (id: string) => {
    setRubricFields(rubricFields.filter(field => field.id !== id))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const handleTaskJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setTaskJsonFile(file)

    try {
      const text = await file.text()
      const json = JSON.parse(text)

      // Populate task fields from JSON
      if (json.title) setTitle(json.title)
      if (json.description) setDescription(json.description)
      if (json.deadline) setDeadline(json.deadline.replace('Z', '').slice(0, 16))

      setError(null)
    } catch (err) {
      setError('Invalid task JSON file. Please check the format.')
    }
  }

  const handleRubricJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setRubricJsonFile(file)

    try {
      const text = await file.text()
      const json = JSON.parse(text)

      // Populate rubric fields from JSON
      if (json.name) setRubricName(json.name)
      if (json.description) setRubricDescription(json.description)
      if (json.fields && Array.isArray(json.fields)) {
        setRubricFields(json.fields)
      }

      setError(null)
    } catch (err) {
      setError('Invalid rubric JSON file. Please check the format.')
    }
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Task title is required')
      return
    }

    if (rubricFields.length === 0) {
      setError('Add at least one rubric field')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 0. Upload JSON files to storage if provided
      let taskJsonPath = null
      let rubricJsonPath = null

      // 1. Create the task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title,
          description,
          deadline: deadline || null,
          created_by: userId,
          status: 'draft',
        })
        .select()
        .single()

      if (taskError) throw taskError

      // Upload task JSON to storage
      if (taskJsonFile) {
        const fileName = `tasks/${task.id}/task.json`
        const { error: uploadError } = await supabase.storage
          .from('artifacts')
          .upload(fileName, taskJsonFile)

        if (!uploadError) {
          taskJsonPath = fileName
        }
      }

      // Upload rubric JSON to storage
      if (rubricJsonFile) {
        const fileName = `tasks/${task.id}/rubric.json`
        const { error: uploadError } = await supabase.storage
          .from('artifacts')
          .upload(fileName, rubricJsonFile)

        if (!uploadError) {
          rubricJsonPath = fileName
        }
      }

      // 2. Create the rubric
      const { error: rubricError } = await supabase
        .from('rubrics')
        .insert({
          task_id: task.id,
          name: rubricName || title,
          description: rubricDescription,
          schema: { fields: rubricFields },
        })

      if (rubricError) throw rubricError

      // 3. Upload artifacts
      for (const file of files) {
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

  const fieldTypes: { value: RubricFieldType; label: string }[] = [
    { value: 'text', label: 'Short Text' },
    { value: 'textarea', label: 'Long Text' },
    { value: 'number', label: 'Number' },
    { value: 'rating', label: 'Rating (1-5)' },
    { value: 'select', label: 'Single Choice' },
    { value: 'multiselect', label: 'Multiple Choice' },
    { value: 'boolean', label: 'Yes/No' },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Create New Task</h2>
          <div className="mt-4 flex gap-2">
            <button
              className={`px-4 py-2 rounded ${step === 'basic' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
              onClick={() => setStep('basic')}
            >
              1. Basic Info
            </button>
            <button
              className={`px-4 py-2 rounded ${step === 'rubric' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
              onClick={() => setStep('rubric')}
            >
              2. Rubric
            </button>
            <button
              className={`px-4 py-2 rounded ${step === 'artifacts' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
              onClick={() => setStep('artifacts')}
            >
              3. Artifacts
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
              {error}
            </div>
          )}

          {step === 'basic' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm font-medium text-blue-900 mb-2">Upload Task JSON (Optional)</p>
                <p className="text-xs text-blue-800 mb-2">
                  Upload a JSON file to auto-populate task fields. See examples/task-example.json for format.
                </p>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleTaskJsonUpload}
                  className="w-full px-3 py-2 border border-blue-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                {taskJsonFile && (
                  <p className="text-xs text-green-700 mt-2">
                    ✓ Loaded: {taskJsonFile.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter task title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter task description"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deadline (optional)
                </label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          {step === 'rubric' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm font-medium text-blue-900 mb-2">Upload Rubric JSON (Optional)</p>
                <p className="text-xs text-blue-800 mb-2">
                  Upload a JSON file to auto-populate rubric fields. See examples/rubric-example.json for format.
                </p>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRubricJsonUpload}
                  className="w-full px-3 py-2 border border-blue-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                {rubricJsonFile && (
                  <p className="text-xs text-green-700 mt-2">
                    ✓ Loaded: {rubricJsonFile.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rubric Name
                </label>
                <input
                  type="text"
                  value={rubricName}
                  onChange={(e) => setRubricName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter rubric name (optional, defaults to task title)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rubric Description
                </label>
                <textarea
                  value={rubricDescription}
                  onChange={(e) => setRubricDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter rubric description (optional)"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Rubric Fields *
                  </label>
                  <button
                    onClick={addRubricField}
                    className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
                  >
                    + Add Field
                  </button>
                </div>

                {rubricFields.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 rounded border-2 border-dashed border-gray-300">
                    <p className="text-gray-600">No fields added yet</p>
                    <button
                      onClick={addRubricField}
                      className="mt-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    >
                      Add your first field →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rubricFields.map((field, index) => (
                      <div key={field.id} className="border border-gray-200 rounded p-4 bg-gray-50">
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-sm font-medium text-gray-700">Field {index + 1}</span>
                          <button
                            onClick={() => removeRubricField(field.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Label</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateRubricField(field.id, { label: e.target.value })}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              placeholder="Field label"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Type</label>
                            <select
                              value={field.type}
                              onChange={(e) => updateRubricField(field.id, { type: e.target.value as RubricFieldType })}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            >
                              {fieldTypes.map(type => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center">
                          <input
                            type="checkbox"
                            checked={field.required || false}
                            onChange={(e) => updateRubricField(field.id, { required: e.target.checked })}
                            className="mr-2"
                          />
                          <label className="text-xs text-gray-600">Required field</label>
                        </div>

                        {(field.type === 'select' || field.type === 'multiselect') && (
                          <div className="mt-2">
                            <label className="block text-xs text-gray-600 mb-1">Options (comma separated)</label>
                            <input
                              type="text"
                              value={field.options?.join(', ') || ''}
                              onChange={(e) => updateRubricField(field.id, {
                                options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
                              })}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              placeholder="Option 1, Option 2, Option 3"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'artifacts' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Upload Artifacts (PDF, Excel files)
                </label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {files.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Selected files:</p>
                  <ul className="space-y-1">
                    {files.map((file, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                        {file.name} ({(file.size / 1024).toFixed(2)} KB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Labelers will be able to view and download these files when working on the task.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>

          <div className="flex gap-2">
            {step !== 'basic' && (
              <button
                onClick={() => setStep(step === 'artifacts' ? 'rubric' : 'basic')}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Previous
              </button>
            )}

            {step !== 'artifacts' ? (
              <button
                onClick={() => setStep(step === 'basic' ? 'rubric' : 'artifacts')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
                disabled={loading}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Task'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
