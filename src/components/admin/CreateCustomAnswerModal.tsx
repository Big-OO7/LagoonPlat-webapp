'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, GraderConfig } from '@/types/database'

interface CreateCustomAnswerModalProps {
  task: Task
  onClose: () => void
  onSuccess: () => void
}

export default function CreateCustomAnswerModal({ task, onClose, onSuccess }: CreateCustomAnswerModalProps) {
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  // Extract field names from graders
  const fields: string[] = []
  if (task.graders && Array.isArray(task.graders)) {
    task.graders.forEach((grader: GraderConfig) => {
      if (grader.config.structure) {
        grader.config.structure.forEach(field => {
          if (!fields.includes(field.id)) {
            fields.push(field.id)
          }
        })
      }
      if (grader.config.test_cases) {
        grader.config.test_cases.forEach(testCase => {
          if (!fields.includes(testCase.id)) {
            fields.push(testCase.id)
          }
        })
      }
    })
  }

  const handleCreate = async () => {
    setCreating(true)

    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        alert('You must be logged in')
        return
      }

      // Create response_data structure
      const responseData = {
        formData: formData
      }

      // Create reviewer-created submission
      const { data, error } = await supabase
        .from('submissions')
        .insert({
          task_id: task.id,
          labeler_id: user.id, // Use reviewer's ID as labeler
          response_data: responseData,
          rubric_data: {},
          grader_results: null,
          score: null,
          status: 'reviewed',
          submitted_at: new Date().toISOString(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          is_reviewer_created: true,
          is_first_submission: true,
          created_by: user.id,
          labeler_comment: 'Custom answer created by reviewer',
          flagged_unsolvable: false
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating custom answer:', error)
        alert(`Failed to create custom answer: ${error.message}`)
        return
      }

      // Set as best submission
      await supabase
        .from('tasks')
        .update({ best_submission_id: data.id })
        .eq('id', task.id)

      alert('Custom answer created and set as best submission!')
      onSuccess()
    } catch (error) {
      console.error('Error:', error)
      alert('Failed to create custom answer')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Create Custom Answer</h2>
              <p className="text-gray-600 mt-1">
                Task: <span className="font-medium">{task.title}</span>
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> This creates a custom &quot;best answer&quot; for this task.
              Fill in the expected values below and they will be used for exports.
            </p>
          </div>

          {fields.length === 0 ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-900">
                This task has no graders configured. You cannot create a custom answer for tasks without graders.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {fields.map((fieldId) => (
                <div key={fieldId}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {fieldId}
                  </label>
                  <input
                    type="text"
                    value={formData[fieldId] || ''}
                    onChange={(e) => setFormData({ ...formData, [fieldId]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder={`Enter value for ${fieldId}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || fields.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create & Set as Best'}
          </button>
        </div>
      </div>
    </div>
  )
}
