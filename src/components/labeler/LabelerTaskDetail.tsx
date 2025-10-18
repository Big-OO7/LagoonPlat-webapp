'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, Submission } from '@/types/database'
import { evaluateResponse } from '@/lib/grader'
import FillInTheBlankForm from './FillInTheBlankForm'

interface LabelerTaskDetailProps {
  taskId: string
  labelerId: string
  onClose: () => void
  onSubmit: () => void
}

export default function LabelerTaskDetail({ taskId, labelerId, onClose, onSubmit }: LabelerTaskDetailProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [responseText, setResponseText] = useState('')
  const [formResponses, setFormResponses] = useState<Record<string, string | number>>({})
  const [editedPrompt, setEditedPrompt] = useState('')
  const [labelerComment, setLabelerComment] = useState('')
  const [flaggedUnsolvable, setFlaggedUnsolvable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
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

    if (taskData) {
      setTask(taskData)
      setEditedPrompt(taskData.prompt || '')
    }

    // Load existing submission
    const { data: submissionData } = await supabase
      .from('submissions')
      .select('*')
      .eq('task_id', taskId)
      .eq('labeler_id', labelerId)
      .single()

    if (submissionData) {
      setSubmission(submissionData)
      // Load previous response if exists
      if (submissionData.response_data && typeof submissionData.response_data === 'object') {
        if ('text' in submissionData.response_data) {
          setResponseText(String(submissionData.response_data.text) || '')
        }
        // Load form responses for structured graders
        if ('formData' in submissionData.response_data && typeof submissionData.response_data.formData === 'object') {
          setFormResponses(submissionData.response_data.formData as Record<string, string | number>)
        }
        // Load edited prompt if previously saved
        if ('editedPrompt' in submissionData.response_data && submissionData.response_data.editedPrompt) {
          setEditedPrompt(String(submissionData.response_data.editedPrompt))
        }
      }
      // Load labeler comment and flag
      setLabelerComment(submissionData.labeler_comment || '')
      setFlaggedUnsolvable(submissionData.flagged_unsolvable || false)
    }

    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!task) return

    // Check if we're using form-based or text-based response
    const hasStructuredGrader = task.graders?.some(g => {
      if (!g || !g.config) return false
      const hasStructure = g.config.structure && Array.isArray(g.config.structure) && g.config.structure.length > 0
      const hasTestCases = g.config.test_cases && Array.isArray(g.config.test_cases) && g.config.test_cases.length > 0
      return hasStructure || hasTestCases
    })

    let responseToGrade = ''

    if (hasStructuredGrader) {
      // Find the grader (either structure or test_cases based)
      const grader = task.graders?.find(g => {
        if (!g || !g.config) return false
        return (g.config.structure && g.config.structure.length > 0) || (g.config.test_cases && g.config.test_cases.length > 0)
      })

      // Validate form responses
      if (grader) {
        // For structure-based graders
        if (grader.config.structure) {
          for (const field of grader.config.structure) {
            const value = formResponses[field.name]
            const isEmpty = value === undefined || value === null || value === '' ||
                           (typeof value === 'string' && value.trim() === '')
            if (isEmpty) {
              alert(`Please fill in the "${field.name}" field before submitting.`)
              return
            }
          }
        }
        // For test_cases-based graders (unit_test)
        if (grader.config.test_cases) {
          for (const testCase of grader.config.test_cases) {
            const value = formResponses[testCase.id]
            const isEmpty = value === undefined || value === null || value === '' ||
                           (typeof value === 'string' && value.trim() === '')
            if (isEmpty) {
              alert(`Please fill in the "${testCase.id}" field before submitting.`)
              return
            }
          }
        }
      }

      // Construct XML or JSON from form responses
      if (grader?.type === 'xml' || grader?.type === 'unit_test') {
        responseToGrade = Object.entries(formResponses)
          .map(([key, value]) => `<${key}>${value}</${key}>`)
          .join('\n')
      } else if (grader?.type === 'json') {
        responseToGrade = JSON.stringify(formResponses, null, 2)
      }
    } else {
      // Use plain text response
      if (!responseText.trim()) {
        alert('Please provide a response before submitting.')
        return
      }
      responseToGrade = responseText
    }

    setSubmitting(true)

    try {
      // Evaluate the response with graders
      let graderResults = null
      let score = null

      if (task.graders && Array.isArray(task.graders) && task.graders.length > 0) {
        console.log('Evaluating response:', responseToGrade)
        console.log('With graders:', JSON.stringify(task.graders, null, 2))
        try {
          const evaluation = await evaluateResponse(responseToGrade, task.graders)
          console.log('Evaluation result:', evaluation)
          graderResults = evaluation
          score = evaluation.percentageScore
        } catch (evalError) {
          console.error('Grader evaluation failed:', evalError)
          console.error('Error stack:', evalError instanceof Error ? evalError.stack : 'No stack')
          throw new Error(`Grading failed: ${evalError instanceof Error ? evalError.message : 'Unknown grading error'}`)
        }
      }

      const responseData = hasStructuredGrader
        ? { formData: formResponses, generatedResponse: responseToGrade, editedPrompt: editedPrompt }
        : { text: responseText, editedPrompt: editedPrompt }

      console.log('Submitting response data:', responseData)
      console.log('Grader results:', graderResults)
      console.log('Score:', score)

      if (submission) {
        // Update existing submission
        console.log('Updating existing submission:', submission.id)
        const updateData = {
          response_data: responseData,
          rubric_data: {}, // Legacy field, provide empty object
          grader_results: graderResults,
          score: score,
          status: 'submitted' as const,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          labeler_comment: labelerComment || null,
          flagged_unsolvable: flaggedUnsolvable,
        }
        console.log('Update data:', updateData)

        const { error } = await supabase
          .from('submissions')
          .update(updateData)
          .eq('id', submission.id)

        if (error) {
          console.error('Database update error:', error)
          throw error
        }
        console.log('Submission updated successfully')
      } else {
        // Create new submission
        console.log('Creating new submission')
        const insertData = {
          task_id: taskId,
          labeler_id: labelerId,
          response_data: responseData,
          rubric_data: {}, // Legacy field, provide empty object
          grader_results: graderResults,
          score: score,
          status: 'submitted' as const,
          submitted_at: new Date().toISOString(),
          labeler_comment: labelerComment || null,
          flagged_unsolvable: flaggedUnsolvable,
        }
        console.log('Insert data:', insertData)

        const { error } = await supabase
          .from('submissions')
          .insert(insertData)

        if (error) {
          console.error('Database insert error:', error)
          throw error
        }
        console.log('Submission created successfully')

        // Update task status
        console.log('Updating task status')
        await supabase
          .from('tasks')
          .update({ status: 'submitted' })
          .eq('id', taskId)
      }

      console.log('Calling onSubmit callback')
      onSubmit()
      console.log('Submission complete!')
    } catch (error) {
      console.error('Error submitting:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to submit: ${errorMessage}\n\nPlease check the console for details.`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!task) return

    setSubmitting(true)

    try {
      const hasStructuredGrader = task.graders?.some(g => {
        if (!g || !g.config) return false
        const hasStructure = g.config.structure && Array.isArray(g.config.structure) && g.config.structure.length > 0
        const hasTestCases = g.config.test_cases && Array.isArray(g.config.test_cases) && g.config.test_cases.length > 0
        return hasStructure || hasTestCases
      })

      const responseData = hasStructuredGrader
        ? { formData: formResponses, editedPrompt: editedPrompt }
        : { text: responseText, editedPrompt: editedPrompt }

      if (submission) {
        // Update existing submission
        const { error } = await supabase
          .from('submissions')
          .update({
            response_data: responseData,
            rubric_data: {}, // Legacy field
            updated_at: new Date().toISOString(),
            labeler_comment: labelerComment || null,
            flagged_unsolvable: flaggedUnsolvable,
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
            response_data: responseData,
            rubric_data: {}, // Legacy field
            status: 'in_progress',
            labeler_comment: labelerComment || null,
            flagged_unsolvable: flaggedUnsolvable,
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

  const handleUnsubmit = async () => {
    if (!submission || submission.status !== 'submitted') return

    const confirmed = confirm('Are you sure you want to unsubmit this task? You will be able to edit and resubmit it.')
    if (!confirmed) return

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('submissions')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', submission.id)

      if (error) throw error

      alert('Task unsubmitted successfully! You can now edit and resubmit.')
      await loadTaskDetails()
    } catch (error) {
      console.error('Error unsubmitting:', error)
      alert('Failed to unsubmit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !task) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading task...</p>
        </div>
      </div>
    )
  }

  const isReadOnly = submission?.status === 'reviewed'
  const canUnsubmit = submission?.status === 'submitted'
  const needsRevision = submission?.status === 'revision_requested'

  // Check if task uses structured graders (form-based) or plain text
  const hasStructuredGrader = task.graders && Array.isArray(task.graders) && task.graders.length > 0 && task.graders.some(g => {
    if (!g || !g.config) return false
    // Support both structure (xml/json) and test_cases (unit_test)
    const hasStructure = g.config.structure && Array.isArray(g.config.structure) && g.config.structure.length > 0
    const hasTestCases = g.config.test_cases && Array.isArray(g.config.test_cases) && g.config.test_cases.length > 0
    return hasStructure || hasTestCases
  })

  // Debug logging
  console.log('Task graders:', task.graders)
  console.log('Has structured grader:', hasStructuredGrader)
  if (task.graders && task.graders.length > 0) {
    task.graders.forEach((grader, index) => {
      console.log(`Grader ${index}:`, grader)
      console.log(`  - type:`, grader?.type)
      console.log(`  - config:`, grader?.config)
      console.log(`  - config.structure:`, grader?.config?.structure)
      console.log(`  - is structure array:`, Array.isArray(grader?.config?.structure))
    })
  }

  // Get example format from graders
  const exampleFormat = task.graders?.[0]?.type === 'xml'
    ? '<answer>your answer here</answer>'
    : task.graders?.[0]?.type === 'json'
    ? '{"answer": "your answer here"}'
    : 'Your answer here'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[95vh] flex flex-col my-auto">
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">{task.title}</h2>
              {task.description && (
                <p className="text-gray-600 mt-2 text-sm whitespace-pre-wrap">{task.description}</p>
              )}
              {submission?.score !== null && submission?.score !== undefined && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm font-medium text-blue-900">
                    Score: {submission.score.toFixed(1)}%
                  </p>
                </div>
              )}
              {submission?.reviewed_at && submission.feedback && submission.status === 'reviewed' && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm font-medium text-green-900">Admin Feedback:</p>
                  <p className="text-sm text-green-800 mt-1 whitespace-pre-wrap">{submission.feedback}</p>
                </div>
              )}
              {needsRevision && submission.feedback && (
                <div className="mt-3 p-3 bg-orange-50 border border-orange-300 rounded">
                  <p className="text-sm font-medium text-orange-900">⚠️ Revision Requested</p>
                  <p className="text-sm text-orange-800 mt-1 whitespace-pre-wrap">{submission.feedback}</p>
                  <p className="text-xs text-orange-700 mt-2 italic">
                    Please address the feedback above and resubmit your work.
                  </p>
                </div>
              )}
              {canUnsubmit && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-900">
                    This task has been submitted. You can unsubmit it to make changes if needed.
                  </p>
                </div>
              )}

              {/* Artifacts Button */}
              <div className="mt-4">
                <a
                  href="https://drive.google.com/drive/folders/1zbVeLDL3D9uNWj5Xd1ZPk1DnsqlG-DPX?usp=sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-sm"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  See Artifacts
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-grow">
          {/* Prompt Section - Editable */}
          {task.prompt && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-blue-900">Task Prompt</h3>
                {!isReadOnly && !canUnsubmit && (
                  <span className="text-xs text-blue-700 italic">✏️ Editable</span>
                )}
              </div>
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                disabled={isReadOnly || canUnsubmit}
                rows={4}
                className="w-full px-3 py-2 bg-white border border-blue-300 rounded text-blue-900 whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-50 disabled:cursor-not-allowed text-sm"
              />
              <p className="text-xs text-blue-700 mt-1">
                {isReadOnly || canUnsubmit ? 'Read-only' : 'You can edit this prompt to clarify your understanding'}
              </p>
            </div>
          )}

          {/* Response Input - Fill-in-the-blank for structured graders */}
          {hasStructuredGrader ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Your Response</h3>
              <p className="text-sm text-gray-600 mb-4">
                Fill in each field between the XML tags below. Your response will be automatically formatted and graded.
              </p>
              <FillInTheBlankForm
                graders={task.graders || []}
                formResponses={formResponses}
                onChange={setFormResponses}
                disabled={isReadOnly || canUnsubmit}
              />
            </div>
          ) : (
            /* Plain text response for text/number graders */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Response *
              </label>
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                disabled={isReadOnly || canUnsubmit}
                rows={12}
                placeholder={exampleFormat}
                className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter your response above
              </p>
            </div>
          )}

          {/* Info message */}
          {!hasStructuredGrader && task.graders && task.graders.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-900">
                ✓ Your response will be automatically graded when you submit.
              </p>
            </div>
          )}

          {/* Labeler Comments and Flags Section */}
          {!isReadOnly && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-orange-900">Report an Issue (Optional)</h3>
              <p className="text-xs text-orange-800">
                If you encounter problems with this task, you can leave a comment or flag it as unsolvable.
              </p>

              {/* Flag checkbox */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="flagUnsolvable"
                  checked={flaggedUnsolvable}
                  onChange={(e) => setFlaggedUnsolvable(e.target.checked)}
                  disabled={canUnsubmit}
                  className="mt-1 w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                />
                <label htmlFor="flagUnsolvable" className="text-sm text-orange-900 cursor-pointer">
                  <span className="font-medium">Flag as unsolvable or problematic</span>
                  <p className="text-xs text-orange-700 mt-1">
                    Check this box if the task has errors, is unclear, or cannot be completed as stated.
                  </p>
                </label>
              </div>

              {/* Comment textarea */}
              <div>
                <label htmlFor="labelerComment" className="block text-sm font-medium text-orange-900 mb-1">
                  Your Comments
                </label>
                <textarea
                  id="labelerComment"
                  value={labelerComment}
                  onChange={(e) => setLabelerComment(e.target.value)}
                  disabled={canUnsubmit}
                  rows={3}
                  placeholder="Describe any issues, ambiguities, or problems with this task..."
                  className="w-full px-3 py-2 border border-orange-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-orange-100 disabled:text-orange-900 disabled:cursor-not-allowed placeholder:text-gray-400"
                />
                <p className="text-xs text-orange-700 mt-1">
                  Your comments will be visible to administrators and help improve task quality.
                </p>
              </div>
            </div>
          )}
        </div>

        {(!isReadOnly && !canUnsubmit) || needsRevision ? (
          <div className={`p-6 border-t border-gray-200 flex justify-between flex-shrink-0 ${needsRevision ? 'bg-orange-50' : ''}`}>
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
                className={`px-4 py-2 ${needsRevision ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'} text-white rounded disabled:opacity-50`}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : needsRevision ? 'Resubmit Task' : 'Submit Task'}
              </button>
            </div>
          </div>
        ) : null}

        {canUnsubmit && (
          <div className="p-6 border-t border-gray-200 flex justify-between flex-shrink-0 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={handleUnsubmit}
              disabled={submitting}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded disabled:opacity-50"
            >
              {submitting ? 'Unsubmitting...' : 'Unsubmit to Edit'}
            </button>
          </div>
        )}

        {isReadOnly && (
          <div className="p-6 border-t border-gray-200 flex-shrink-0 bg-gray-50">
            <p className="text-center text-gray-600">
              This task has been reviewed and cannot be edited.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
