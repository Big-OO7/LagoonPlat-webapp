'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Submission, Task, Rubric, Artifact } from '@/types/database'
import RubricForm from '../labeler/RubricForm'
import ArtifactViewer from '../labeler/ArtifactViewer'

interface SubmissionDetailModalProps {
  submissionId: string
  onClose: () => void
  onUpdate: () => void
}

interface SubmissionWithDetails extends Submission {
  task?: Task
  labeler_email?: string
}

export default function SubmissionDetailModal({ submissionId, onClose, onUpdate }: SubmissionDetailModalProps) {
  const [submission, setSubmission] = useState<SubmissionWithDetails | null>(null)
  const [task, setTask] = useState<Task | null>(null)
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tab, setTab] = useState<'response' | 'grader_results'>('response')
  const supabase = createClient()

  useEffect(() => {
    loadSubmissionDetails()
  }, [submissionId])

  const loadSubmissionDetails = async () => {
    setLoading(true)

    // Load submission
    const { data: submissionData } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single()

    if (!submissionData) {
      setLoading(false)
      return
    }

    // Load labeler email
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', submissionData.labeler_id)
      .single()

    setSubmission({
      ...submissionData,
      labeler_email: profileData?.email
    })
    setFeedback(submissionData.feedback || '')

    // Load task
    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', submissionData.task_id)
      .single()

    if (taskData) setTask(taskData)

    // Load rubric
    const { data: rubricData } = await supabase
      .from('rubrics')
      .select('*')
      .eq('task_id', submissionData.task_id)
      .single()

    if (rubricData) setRubric(rubricData)

    // Load artifacts
    const { data: artifactsData } = await supabase
      .from('artifacts')
      .select('*')
      .eq('task_id', submissionData.task_id)

    if (artifactsData) setArtifacts(artifactsData)

    setLoading(false)
  }

  const handleMarkAsReviewed = async () => {
    if (!submission) return

    // Prevent approving if there is feedback/comments
    if (feedback.trim()) {
      const confirmed = confirm(
        '⚠️ WARNING: This submission has comments/feedback.\n\n' +
        'Approving with comments will make it unavailable for the labeler to fix.\n' +
        'The task will appear in "With Comments" in the Export page but cannot be edited.\n\n' +
        'Instead, you should:\n' +
        '1. Use "Request Revision" button to send it back to the labeler\n' +
        '2. The labeler can then fix the issues and resubmit\n\n' +
        'Do you really want to approve WITH comments? (Not recommended)'
      )
      if (!confirmed) return
    }

    setSubmitting(true)

    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'reviewed',
          feedback: feedback,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', submission.id)

      if (error) {
        console.error('Database error:', error)
        throw error
      }

      alert('Submission approved and marked as reviewed!')
      onUpdate()
    } catch (error) {
      console.error('Error marking as reviewed:', error)
      alert(`Failed to mark as reviewed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestRevision = async () => {
    if (!submission) return

    if (!feedback.trim()) {
      alert('Please provide feedback explaining what needs to be revised.')
      return
    }

    const confirmed = confirm(
      'This will send the submission back to the labeler for revision. They will be able to edit and resubmit. Continue?'
    )
    if (!confirmed) return

    setSubmitting(true)

    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'revision_requested',
          feedback: feedback,
          reviewed_by: user?.id || null,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', submission.id)

      if (error) {
        console.error('Database error:', error)
        throw error
      }

      alert('Revision request sent successfully! The labeler can now edit and resubmit.')
      onUpdate()
    } catch (error) {
      console.error('Error requesting revision:', error)
      alert(`Failed to request revision: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateFeedback = async () => {
    if (!submission) return

    setSubmitting(true)

    try {
      const { error } = await supabase
        .from('submissions')
        .update({
          feedback: feedback,
          updated_at: new Date().toISOString(),
        })
        .eq('id', submission.id)

      if (error) throw error

      alert('Feedback updated successfully!')
      onUpdate()
    } catch (error) {
      console.error('Error updating feedback:', error)
      alert('Failed to update feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !submission || !task) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading submission...</p>
        </div>
      </div>
    )
  }

  const hasGraders = task.graders && task.graders.length > 0
  const hasRubric = rubric !== null

  const isReviewed = submission.status === 'reviewed'

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      in_progress: 'IN PROGRESS',
      submitted: 'PENDING REVIEW',
      reviewed: 'REVIEWED',
      completed: 'COMPLETED',
      revision_requested: 'REVISION REQUESTED',
    }
    return labels[status] || status.replace('_', ' ').toUpperCase()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">Submission Review</h2>
              <div className="mt-2 space-y-1">
                <p className="text-gray-600">
                  <span className="font-medium">Task:</span> {task.title}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Submitted by:</span> {submission.labeler_email}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Submitted at:</span> {new Date(submission.submitted_at).toLocaleString()}
                </p>
                {submission.score !== null && submission.score !== undefined && (
                  <p className="text-gray-600">
                    <span className="font-medium">Auto-Graded Score:</span>{' '}
                    <span className="font-semibold text-lg text-indigo-600">{submission.score.toFixed(1)}%</span>
                  </p>
                )}
                {submission.reviewed_at && (
                  <p className="text-gray-600">
                    <span className="font-medium">Reviewed at:</span> {new Date(submission.reviewed_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="mt-3">
                <span className={`px-3 py-1 rounded text-sm font-medium ${
                  submission.status === 'submitted'
                    ? 'bg-purple-100 text-purple-800'
                    : submission.status === 'reviewed'
                    ? 'bg-green-100 text-green-800'
                    : submission.status === 'in_progress'
                    ? 'bg-yellow-100 text-yellow-800'
                    : submission.status === 'revision_requested'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {getStatusLabel(submission.status)}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setTab('response')}
              className={`px-4 py-2 rounded ${
                tab === 'response' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {hasGraders ? 'Response' : 'Rubric Responses'}
            </button>
            {hasGraders && submission.grader_results && (
              <button
                onClick={() => setTab('grader_results')}
                className={`px-4 py-2 rounded ${
                  tab === 'grader_results' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Grader Results
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {tab === 'response' && (
            <div className="space-y-4">
              {/* Grader-based response */}
              {hasGraders && submission.response_data && (
                <div>
                  {task.prompt && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
                      <h3 className="text-sm font-semibold text-blue-900 mb-2">Task Prompt</h3>
                      <p className="text-blue-800 whitespace-pre-wrap">{task.prompt}</p>
                    </div>
                  )}
                  <div className="p-4 bg-gray-50 border border-gray-300 rounded">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Labeler Response</h3>
                    {typeof submission.response_data === 'object' && 'formData' in submission.response_data ? (
                      <div className="space-y-3">
                        {/* Show grader information if available */}
                        {task.graders?.map((grader, graderIndex) => (
                          grader.config.structure && grader.config.structure.length > 0 && (
                            <div key={graderIndex} className="border-2 border-indigo-200 rounded-lg p-3 bg-indigo-50">
                              {/* Grader Header */}
                              <div className="flex items-center justify-between mb-3 pb-2 border-b border-indigo-300">
                                <div>
                                  <h4 className="font-semibold text-indigo-900 text-sm">
                                    Verifier: {grader.name}
                                  </h4>
                                  <p className="text-xs text-indigo-700 mt-0.5">
                                    Type: {grader.type.toUpperCase()} | Weight: {grader.weight}
                                  </p>
                                </div>
                                <div className="px-2 py-1 bg-indigo-600 text-white text-xs font-semibold rounded">
                                  Grader #{graderIndex + 1}
                                </div>
                              </div>

                              {/* Field Responses */}
                              <div className="space-y-2">
                                {grader.config.structure.map((field, fieldIndex) => {
                                  const responseData = submission.response_data as Record<string, unknown>
                                  const formData = responseData.formData as Record<string, unknown>
                                  const fieldValue = formData[field.name]

                                  return (
                                    <div key={fieldIndex} className="bg-white p-2.5 rounded border border-indigo-300">
                                      <div className="flex items-start justify-between mb-1">
                                        <p className="text-xs font-semibold text-gray-900">
                                          {field.name}
                                          <span className="text-gray-500 ml-1">({field.type})</span>
                                        </p>
                                        <span className="text-xs text-indigo-700 font-mono bg-indigo-100 px-2 py-0.5 rounded">
                                          ID: {field.id}
                                        </span>
                                      </div>
                                      <p className="text-sm text-gray-900 mt-1 font-medium">
                                        {fieldValue !== undefined ? String(fieldValue) : '(no response)'}
                                      </p>
                                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                                        {field.comparator.config.expected !== undefined && (
                                          <div className="px-2 py-1 bg-blue-50 border border-blue-200 rounded">
                                            <span className="text-blue-700">Expected:</span>{' '}
                                            <span className="text-blue-900 font-mono">{String(field.comparator.config.expected)}</span>
                                          </div>
                                        )}
                                        <div className="px-2 py-1 bg-gray-100 border border-gray-300 rounded">
                                          <span className="text-gray-700">Weight:</span>{' '}
                                          <span className="text-gray-900 font-semibold">{field.weight}</span>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        ))}

                        {/* Fallback for when grader structure isn't available */}
                        {(!task.graders || task.graders.every(g => !g.config.structure || g.config.structure.length === 0)) && (
                          <div className="space-y-2">
                            {Object.entries(submission.response_data.formData as Record<string, unknown>).map(([key, value]) => (
                              <div key={key} className="bg-white p-3 rounded border border-gray-200">
                                <p className="text-xs font-semibold text-gray-700">{key}</p>
                                <p className="text-sm text-gray-900 mt-1">{String(value)}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {submission.response_data.generatedResponse ? (
                          <details className="mt-3">
                            <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                              View generated XML/JSON
                            </summary>
                            <pre className="text-xs text-gray-700 mt-2 p-2 bg-gray-100 rounded font-mono">
                              {String(submission.response_data.generatedResponse)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    ) : (
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                        {typeof submission.response_data === 'object' && 'text' in submission.response_data
                          ? String(submission.response_data.text)
                          : JSON.stringify(submission.response_data, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {/* Legacy rubric-based response */}
              {hasRubric && !hasGraders && rubric && (
                <RubricForm
                  rubric={rubric}
                  data={submission.rubric_data as Record<string, unknown>}
                  onChange={() => {}} // Read-only
                  readOnly={true}
                />
              )}

              {!hasGraders && !hasRubric && (
                <div className="text-center py-12 bg-gray-50 rounded border-2 border-dashed border-gray-300">
                  <p className="text-gray-600">No response data available</p>
                </div>
              )}
            </div>
          )}

          {tab === 'grader_results' && hasGraders && submission.grader_results && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded">
                <h3 className="text-sm font-semibold text-indigo-900 mb-2">Auto-Grading Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-indigo-700">Total Score</p>
                    <p className="text-2xl font-bold text-indigo-900">
                      {typeof submission.grader_results === 'object' &&
                       submission.grader_results !== null &&
                       'totalScore' in submission.grader_results
                        ? String(submission.grader_results.totalScore)
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-indigo-700">Max Score</p>
                    <p className="text-2xl font-bold text-indigo-900">
                      {typeof submission.grader_results === 'object' &&
                       submission.grader_results !== null &&
                       'maxScore' in submission.grader_results
                        ? String(submission.grader_results.maxScore)
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-indigo-700">Percentage</p>
                    <p className="text-2xl font-bold text-indigo-900">
                      {submission.score !== null && submission.score !== undefined
                        ? `${submission.score.toFixed(1)}%`
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {typeof submission.grader_results === 'object' &&
                'graderResults' in submission.grader_results &&
                Array.isArray(submission.grader_results.graderResults) && (
                  <div className="space-y-3">
                    {submission.grader_results.graderResults.map((result: Record<string, unknown>, index: number) => (
                      <div key={index} className="border border-gray-300 rounded p-4 bg-white">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">
                              {String(result.graderName || `Grader ${index + 1}`)}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Score: <span className="font-medium">{String(result.score)}</span> /{' '}
                              <span className="font-medium">{String(result.maxScore)}</span>
                            </p>
                          </div>
                          <div>
                            {result.passed ? (
                              <span className="px-3 py-1 bg-green-100 text-green-800 rounded text-sm font-medium">
                                ✓ Passed
                              </span>
                            ) : (
                              <span className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm font-medium">
                                ✗ Failed
                              </span>
                            )}
                          </div>
                        </div>

                        {result.details && typeof result.details === 'object' && result.details !== null ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-semibold text-gray-700 uppercase">Details</p>
                            {Object.entries(result.details).map(([key, value]) => {
                              if (typeof value === 'object' && value !== null) {
                                const detail = value as Record<string, unknown>
                                return (
                                  <div key={key} className="bg-gray-50 border border-gray-200 rounded p-2 text-sm">
                                    <p className="font-medium text-gray-900">{key}</p>
                                    <div className="mt-1 space-y-1 text-xs">
                                      {detail.expected !== undefined && (
                                        <p className="text-gray-600">
                                          Expected: <span className="font-mono">{String(detail.expected)}</span>
                                        </p>
                                      )}
                                      {detail.actual !== undefined && (
                                        <p className="text-gray-600">
                                          Actual: <span className="font-mono">{String(detail.actual)}</span>
                                        </p>
                                      )}
                                      {detail.passed !== undefined && (
                                        <p className={detail.passed ? 'text-green-600' : 'text-red-600'}>
                                          {detail.passed ? '✓ Passed' : '✗ Failed'}
                                        </p>
                                      )}
                                      {detail.weight !== undefined && (
                                        <p className="text-gray-500">Weight: {String(detail.weight)}</p>
                                      )}
                                    </div>
                                  </div>
                                )
                              }
                              return null
                            })}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin Feedback {isReviewed && <span className="text-gray-500">(Sent to labeler)</span>}
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Enter feedback for the labeler..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
                disabled={submitting}
              >
                Close
              </button>

              <div className="flex gap-2">
                {isReviewed && (
                  <button
                    onClick={handleUpdateFeedback}
                    className="px-4 py-2 border border-indigo-600 text-indigo-600 rounded hover:bg-indigo-50 disabled:opacity-50"
                    disabled={submitting}
                  >
                    {submitting ? 'Updating...' : 'Update Feedback'}
                  </button>
                )}
                {!isReviewed && (
                  <>
                    <button
                      onClick={handleRequestRevision}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded disabled:opacity-50"
                      disabled={submitting}
                    >
                      {submitting ? 'Requesting...' : 'Request Edits'}
                    </button>
                    <button
                      onClick={handleMarkAsReviewed}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50"
                      disabled={submitting}
                    >
                      {submitting ? 'Approving...' : 'Approve & Mark Reviewed'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
