'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, Artifact, Rubric, Submission, RubricField } from '@/types/database'
import RubricForm from './RubricForm'
import ArtifactViewer from './ArtifactViewer'

interface LabelerTaskDetailProps {
  taskId: string
  labelerId: string
  onClose: () => void
  onSubmit: () => void
}

export default function LabelerTaskDetail({ taskId, labelerId, onClose, onSubmit }: LabelerTaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [rubricData, setRubricData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState<'rubric' | 'artifacts'>('rubric')
  const supabase = createClient()

  useEffect(() => {
    loadTaskDetails()
  }, [taskId])

  const loadTaskDetails = async () => {
    setLoading(true)

    // Load task
    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskData) setTask(taskData)

    // Load rubric
    const { data: rubricData } = await supabase
      .from('rubrics')
      .select('*')
      .eq('task_id', taskId)
      .single()

    if (rubricData) setRubric(rubricData)

    // Load artifacts
    const { data: artifactsData } = await supabase
      .from('artifacts')
      .select('*')
      .eq('task_id', taskId)

    if (artifactsData) setArtifacts(artifactsData)

    // Load existing submission
    const { data: submissionData } = await supabase
      .from('submissions')
      .select('*')
      .eq('task_id', taskId)
      .eq('labeler_id', labelerId)
      .single()

    if (submissionData) {
      setSubmission(submissionData)
      setRubricData(submissionData.rubric_data as Record<string, unknown>)
    }

    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!task || !rubric) return

    // Validate required fields
    const missingRequired = rubric.schema.fields
      .filter(f => f.required)
      .find(f => !rubricData[f.id] || rubricData[f.id] === '')

    if (missingRequired) {
      alert(`Please fill in the required field: ${missingRequired.label}`)
      return
    }

    setSubmitting(true)

    try {
      if (submission) {
        // Update existing submission
        const { error } = await supabase
          .from('submissions')
          .update({
            rubric_data: rubricData,
            status: 'submitted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', submission.id)

        if (error) throw error
      } else {
        // Create new submission
        const { error } = await supabase
          .from('submissions')
          .insert({
            task_id: taskId,
            labeler_id: labelerId,
            rubric_data: rubricData,
            status: 'submitted',
          })

        if (error) throw error

        // Update task status
        await supabase
          .from('tasks')
          .update({ status: 'submitted' })
          .eq('id', taskId)
      }

      onSubmit()
    } catch (error) {
      console.error('Error submitting:', error)
      alert('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!task) return

    setSubmitting(true)

    try {
      if (submission) {
        // Update existing submission
        const { error } = await supabase
          .from('submissions')
          .update({
            rubric_data: rubricData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', submission.id)

        if (error) throw error
      } else {
        // Create new submission as draft
        const { error } = await supabase
          .from('submissions')
          .insert({
            task_id: taskId,
            labeler_id: labelerId,
            rubric_data: rubricData,
            status: 'in_progress',
          })

        if (error) throw error

        // Update task status
        await supabase
          .from('tasks')
          .update({ status: 'in_progress' })
          .eq('id', taskId)
      }

      alert('Draft saved successfully!')
      await loadTaskDetails()
    } catch (error) {
      console.error('Error saving draft:', error)
      alert('Failed to save draft. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !task || !rubric) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading task...</p>
        </div>
      </div>
    )
  }

  const isReadOnly = submission?.status === 'submitted' || submission?.status === 'reviewed'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-5xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">{task.title}</h2>
              {task.description && (
                <p className="text-gray-600 mt-2">{task.description}</p>
              )}
              {task.deadline && (
                <p className="text-sm text-gray-500 mt-2">
                  Deadline: {new Date(task.deadline).toLocaleString()}
                </p>
              )}
              {submission?.reviewed_at && submission.feedback && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm font-medium text-green-900">Admin Feedback:</p>
                  <p className="text-sm text-green-800 mt-1">{submission.feedback}</p>
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setTab('rubric')}
              className={`px-4 py-2 rounded ${
                tab === 'rubric' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Rubric Form ({rubric.schema.fields.length} fields)
            </button>
            <button
              onClick={() => setTab('artifacts')}
              className={`px-4 py-2 rounded ${
                tab === 'artifacts' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Artifacts ({artifacts.length} files)
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {tab === 'rubric' && (
            <RubricForm
              rubric={rubric}
              data={rubricData}
              onChange={setRubricData}
              readOnly={isReadOnly}
            />
          )}

          {tab === 'artifacts' && (
            <ArtifactViewer artifacts={artifacts} />
          )}
        </div>

        {!isReadOnly && (
          <div className="p-6 border-t border-gray-200 flex justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              Cancel
            </button>

            <div className="flex gap-2">
              <button
                onClick={handleSaveDraft}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Task'}
              </button>
            </div>
          </div>
        )}

        {isReadOnly && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <p className="text-center text-gray-600">
              This task has been submitted and cannot be edited.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
