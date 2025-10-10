'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, Submission } from '@/types/database'
import { evaluateResponse } from '@/lib/grader'

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

    if (taskData) setTask(taskData)

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
      if (submissionData.response_data && typeof submissionData.response_data === 'object' && 'text' in submissionData.response_data) {
        setResponseText(String(submissionData.response_data.text) || '')
      }
    }

    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!task) return

    if (!responseText.trim()) {
      alert('Please provide a response before submitting.')
      return
    }

    setSubmitting(true)

    try {
      // Evaluate the response with graders
      let graderResults = null
      let score = null

      if (task.graders && Array.isArray(task.graders) && task.graders.length > 0) {
        const evaluation = await evaluateResponse(responseText, task.graders)
        graderResults = evaluation
        score = evaluation.percentageScore
      }

      const responseData = { text: responseText }

      if (submission) {
        // Update existing submission
        const { error } = await supabase
          .from('submissions')
          .update({
            response_data: responseData,
            grader_results: graderResults,
            score: score,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
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
            response_data: responseData,
            grader_results: graderResults,
            score: score,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
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
      const responseData = { text: responseText }

      if (submission) {
        // Update existing submission
        const { error } = await supabase
          .from('submissions')
          .update({
            response_data: responseData,
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
            response_data: responseData,
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

  // Get example format from graders
  const exampleFormat = task.graders?.[0]?.type === 'xml'
    ? '<answer>your answer here</answer>'
    : task.graders?.[0]?.type === 'json'
    ? '{"answer": "your answer here"}'
    : 'Your answer here'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-5xl w-full my-8">
        <div className="p-6 border-b border-gray-200">
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
              {submission?.reviewed_at && submission.feedback && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm font-medium text-green-900">Admin Feedback:</p>
                  <p className="text-sm text-green-800 mt-1 whitespace-pre-wrap">{submission.feedback}</p>
                </div>
              )}
              {canUnsubmit && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-sm text-yellow-900">
                    This task has been submitted. You can unsubmit it to make changes if needed.
                  </p>
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Prompt Section */}
          {task.prompt && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">Task Prompt</h3>
              <p className="text-blue-800 whitespace-pre-wrap">{task.prompt}</p>
            </div>
          )}

          {/* Response Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Response *
            </label>
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              disabled={isReadOnly}
              rows={12}
              placeholder={exampleFormat}
              className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              {task.graders?.[0]?.type === 'xml' && 'Provide your response in XML format. Use the exact field names shown in the placeholder above.'}
              {task.graders?.[0]?.type === 'json' && 'Provide your response in valid JSON format. Use the exact field names shown in the placeholder above.'}
              {(!task.graders || task.graders.length === 0 || (task.graders[0].type !== 'xml' && task.graders[0].type !== 'json')) && 'Enter your response above'}
            </p>
          </div>

          {/* Grader Info */}
          {task.graders && task.graders.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Evaluation Criteria</h3>
              <p className="text-xs text-gray-600">
                This task will be automatically evaluated using {task.graders.length} grader{task.graders.length > 1 ? 's' : ''}.
              </p>
            </div>
          )}
        </div>

        {!isReadOnly && !canUnsubmit && (
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

        {canUnsubmit && (
          <div className="p-6 border-t border-gray-200 flex justify-between bg-gray-50">
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
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <p className="text-center text-gray-600">
              This task has been reviewed and cannot be edited.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
