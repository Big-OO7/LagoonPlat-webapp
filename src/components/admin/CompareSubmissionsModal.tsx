'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Submission, Task } from '@/types/database'

interface CompareSubmissionsModalProps {
  taskId: string
  onClose: () => void
  onUpdate: () => void
}

interface SubmissionWithLabeler extends Submission {
  labeler_email?: string
}

export default function CompareSubmissionsModal({ taskId, onClose, onUpdate }: CompareSubmissionsModalProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [submissions, setSubmissions] = useState<SubmissionWithLabeler[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [taskId])

  const loadData = async () => {
    setLoading(true)

    // Load task
    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskData) setTask(taskData)

    // Load all submissions for this task
    const { data: submissionsData } = await supabase
      .from('submissions')
      .select('*')
      .eq('task_id', taskId)
      .in('status', ['submitted', 'reviewed', 'completed', 'revision_requested'])
      .order('submitted_at', { ascending: false })

    if (submissionsData && submissionsData.length > 0) {
      // Load labeler emails
      const labelerIds = [...new Set(submissionsData.map(s => s.labeler_id))]
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('id, email')
        .in('id', labelerIds)

      const enrichedSubmissions = submissionsData.map(sub => ({
        ...sub,
        labeler_email: profilesData?.find(p => p.id === sub.labeler_id)?.email
      }))

      setSubmissions(enrichedSubmissions)
    }

    setLoading(false)
  }

  const handleSelectBest = async (submissionId: string) => {
    if (!task) return

    const submission = submissions.find(s => s.id === submissionId)
    if (!submission) return

    const confirmed = confirm(
      `Are you sure you want to mark ${submission.labeler_email}'s submission as the best for this task?\n\nThis will be used for exports and reporting.`
    )
    if (!confirmed) return

    setSelecting(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ best_submission_id: submissionId })
        .eq('id', taskId)

      if (error) throw error

      alert('Best submission selected successfully!')
      onUpdate()
    } catch (error) {
      console.error('Error selecting best submission:', error)
      alert('Failed to select best submission. Please try again.')
    } finally {
      setSelecting(false)
    }
  }

  const handleClearSelection = async () => {
    if (!task) return

    const confirmed = confirm(
      'Are you sure you want to clear the best submission selection for this task?'
    )
    if (!confirmed) return

    setSelecting(true)

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ best_submission_id: null })
        .eq('id', taskId)

      if (error) throw error

      alert('Best submission selection cleared!')
      onUpdate()
    } catch (error) {
      console.error('Error clearing selection:', error)
      alert('Failed to clear selection. Please try again.')
    } finally {
      setSelecting(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      submitted: 'bg-purple-100 text-purple-800',
      reviewed: 'bg-green-100 text-green-800',
      completed: 'bg-green-200 text-green-900',
      revision_requested: 'bg-orange-100 text-orange-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const renderResponseData = (submission: SubmissionWithLabeler) => {
    if (!submission.response_data) return <p className="text-gray-500">No response data</p>

    // Handle grader-based responses
    if (typeof submission.response_data === 'object' && 'formData' in submission.response_data) {
      const formData = submission.response_data.formData as Record<string, unknown>
      return (
        <div className="space-y-2">
          {Object.entries(formData).map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="font-medium text-gray-700">{key}:</span>{' '}
              <span className="text-gray-900">{String(value)}</span>
            </div>
          ))}
        </div>
      )
    }

    // Handle legacy rubric data
    if (submission.rubric_data) {
      return (
        <div className="space-y-2">
          {Object.entries(submission.rubric_data as Record<string, unknown>).map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="font-medium text-gray-700">{key}:</span>{' '}
              <span className="text-gray-900">{String(value)}</span>
            </div>
          ))}
        </div>
      )
    }

    return <pre className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(submission.response_data, null, 2)}</pre>
  }

  if (loading || !task) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading submissions...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Compare Submissions</h2>
              <p className="text-gray-600 mt-1">
                Task: <span className="font-medium">{task.title}</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {submissions.length} submission(s) found
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {task.best_submission_id && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-green-800">
                  Best submission selected: {submissions.find(s => s.id === task.best_submission_id)?.labeler_email}
                </span>
              </div>
              <button
                onClick={handleClearSelection}
                disabled={selecting}
                className="text-sm text-green-700 hover:text-green-900 underline disabled:opacity-50"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        <div className="p-6">
          {submissions.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded border-2 border-dashed border-gray-300">
              <p className="text-gray-600">No submissions found for this task</p>
              <p className="text-sm text-gray-500 mt-2">
                Submissions will appear here once labelers submit their work
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {submissions.map((submission) => (
                <div
                  key={submission.id}
                  className={`border-2 rounded-lg p-4 ${
                    task.best_submission_id === submission.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{submission.labeler_email}</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Submitted: {new Date(submission.submitted_at).toLocaleString()}
                      </p>
                    </div>
                    {task.best_submission_id === submission.id && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs font-medium rounded">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Best
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(submission.status)}`}>
                      {submission.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  {submission.score !== null && submission.score !== undefined && (
                    <div className="mb-3 p-2 bg-indigo-50 border border-indigo-200 rounded">
                      <p className="text-xs text-indigo-700">Auto-Graded Score</p>
                      <p className="text-2xl font-bold text-indigo-900">{submission.score.toFixed(1)}%</p>
                    </div>
                  )}

                  <div className="mb-3 max-h-64 overflow-y-auto">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Response:</p>
                    <div className="text-sm bg-gray-50 p-3 rounded border border-gray-200">
                      {renderResponseData(submission)}
                    </div>
                  </div>

                  {submission.feedback && (
                    <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-xs font-semibold text-yellow-900">Feedback:</p>
                      <p className="text-xs text-yellow-800 mt-1">{submission.feedback}</p>
                    </div>
                  )}

                  {submission.labeler_comment && (
                    <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-xs font-semibold text-blue-900">Labeler Comment:</p>
                      <p className="text-xs text-blue-800 mt-1">{submission.labeler_comment}</p>
                    </div>
                  )}

                  <button
                    onClick={() => handleSelectBest(submission.id)}
                    disabled={selecting || task.best_submission_id === submission.id}
                    className={`w-full py-2 px-4 rounded font-medium text-sm ${
                      task.best_submission_id === submission.id
                        ? 'bg-green-100 text-green-800 cursor-default'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                    }`}
                  >
                    {task.best_submission_id === submission.id
                      ? 'Selected as Best'
                      : selecting
                      ? 'Selecting...'
                      : 'Select as Best'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {task.best_submission_id ? (
                <p>The selected submission will be prioritized in exports and reports.</p>
              ) : (
                <p>Select the best submission to use for exports and reports.</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
