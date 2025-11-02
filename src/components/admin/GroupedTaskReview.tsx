'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Submission, Task } from '@/types/database'
import CreateCustomAnswerModal from './CreateCustomAnswerModal'

interface SubmissionWithLabeler extends Submission {
  labeler_email?: string
}

interface TaskGroup {
  task: Task
  submissions: SubmissionWithLabeler[]
  total_assignments: number
  submitted_count: number
  is_ready: boolean
}

export default function GroupedTaskReview() {
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'ready' | 'pending' | 'all'>('ready')
  const [customAnswerTaskId, setCustomAnswerTaskId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    loadTaskGroups()
  }, [])

  const loadTaskGroups = async () => {
    setLoading(true)

    // Load all tasks with their submissions
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .order('updated_at', { ascending: false })

    if (tasksError) {
      console.error('Error loading tasks:', tasksError)
      setLoading(false)
      return
    }

    if (!tasksData || tasksData.length === 0) {
      setLoading(false)
      return
    }

    // Get all task IDs
    const taskIds = tasksData.map(t => t.id)

    // Load all submissions for these tasks
    const { data: submissionsData, error: submissionsError } = await supabase
      .from('submissions')
      .select('*')
      .in('task_id', taskIds)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })

    if (submissionsError) {
      console.error('Error loading submissions:', submissionsError)
      setLoading(false)
      return
    }

    // Get unique labeler IDs
    const labelerIds = [...new Set((submissionsData || []).map(s => s.labeler_id))]

    // Load labeler profiles
    const { data: profilesData, error: profilesError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .in('id', labelerIds)

    if (profilesError) {
      console.error('Error loading profiles:', profilesError)
    }

    // Load task assignments to get total assigned count
    const { data: assignmentsData, error: assignmentsError } = await supabase
      .from('task_assignments')
      .select('task_id, labeler_id')
      .in('task_id', taskIds)

    if (assignmentsError) {
      console.error('Error loading assignments:', assignmentsError)
    }

    // Count assignments per task
    const assignmentCounts = new Map<string, number>()
    assignmentsData?.forEach(assignment => {
      assignmentCounts.set(
        assignment.task_id,
        (assignmentCounts.get(assignment.task_id) || 0) + 1
      )
    })

    // Group submissions by task
    const submissionsByTask = new Map<string, SubmissionWithLabeler[]>()
    submissionsData?.forEach(submission => {
      if (!submissionsByTask.has(submission.task_id)) {
        submissionsByTask.set(submission.task_id, [])
      }
      const labeler = profilesData?.find(p => p.id === submission.labeler_id)
      submissionsByTask.get(submission.task_id)!.push({
        ...submission,
        labeler_email: labeler?.email
      })
    })

    // Create task groups
    const groups: TaskGroup[] = tasksData.map(task => {
      const submissions = submissionsByTask.get(task.id) || []
      const total_assignments = assignmentCounts.get(task.id) || task.required_submissions || 3
      const submitted_count = submissions.length
      const required = task.required_submissions || 3
      const is_ready = submitted_count >= required

      return {
        task,
        submissions,
        total_assignments,
        submitted_count,
        is_ready
      }
    })

    setTaskGroups(groups)
    setLoading(false)
  }

  const toggleTaskExpansion = (taskId: string) => {
    const newExpanded = new Set(expandedTasks)
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId)
    } else {
      newExpanded.add(taskId)
    }
    setExpandedTasks(newExpanded)
  }

  const handleReviewSubmission = async (submissionId: string, status: 'reviewed' | 'revision_requested', feedback: string) => {
    const { error } = await supabase
      .from('submissions')
      .update({
        status,
        feedback,
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id
      })
      .eq('id', submissionId)

    if (error) {
      console.error('Error updating submission:', error)
      alert('Failed to update submission')
    } else {
      loadTaskGroups()
    }
  }

  const handleBulkApprove = async (taskId: string) => {
    const group = taskGroups.find(g => g.task.id === taskId)
    if (!group) return

    const userId = (await supabase.auth.getUser()).data.user?.id

    // Update all submissions for this task
    const { error } = await supabase
      .from('submissions')
      .update({
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId
      })
      .eq('task_id', taskId)
      .is('reviewed_at', null)

    if (error) {
      console.error('Error bulk approving:', error)
      alert('Failed to approve submissions')
    } else {
      // Update task status
      await supabase
        .from('tasks')
        .update({ status: 'reviewed' })
        .eq('id', taskId)

      loadTaskGroups()
    }
  }

  const handleSelectBest = async (taskId: string, submissionId: string) => {
    const group = taskGroups.find(g => g.task.id === taskId)
    if (!group) return

    const submission = group.submissions.find(s => s.id === submissionId)
    if (!submission) return

    const confirmed = confirm(
      `Mark ${submission.labeler_email}'s submission as the best for this task?\n\nThis will be used for exports and reporting.`
    )
    if (!confirmed) return

    const userId = (await supabase.auth.getUser()).data.user?.id

    // Update task with best_submission_id
    const { error: taskError } = await supabase
      .from('tasks')
      .update({ best_submission_id: submissionId })
      .eq('id', taskId)

    if (taskError) {
      console.error('Error selecting best submission:', taskError)
      alert('Failed to select best submission')
      return
    }

    // Ensure the submission is marked as reviewed so it appears in exports
    if (!submission.reviewed_at || submission.status !== 'reviewed') {
      const { error: submissionError } = await supabase
        .from('submissions')
        .update({
          status: 'reviewed',
          reviewed_at: new Date().toISOString(),
          reviewed_by: userId
        })
        .eq('id', submissionId)

      if (submissionError) {
        console.error('Error reviewing best submission:', submissionError)
        alert('Best submission selected but failed to mark as reviewed')
      }
    }

    alert('Best submission selected successfully!')
    loadTaskGroups()
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      in_progress: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-purple-100 text-purple-800',
      reviewed: 'bg-green-100 text-green-800',
      completed: 'bg-green-200 text-green-900',
      revision_requested: 'bg-orange-100 text-orange-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const filteredGroups = taskGroups.filter(group => {
    if (filter === 'ready') return group.is_ready
    if (filter === 'pending') return !group.is_ready
    return true
  })

  const stats = {
    ready: taskGroups.filter(g => g.is_ready).length,
    pending: taskGroups.filter(g => !g.is_ready).length,
    total: taskGroups.length
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Task Review Queue</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Ready for Review</h3>
          <p className="text-3xl font-bold text-green-600">{stats.ready}</p>
          <p className="text-xs text-gray-500 mt-1">All submissions complete</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Waiting for Submissions</h3>
          <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-gray-500 mt-1">Incomplete tasks</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Tasks</h3>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-1">All tasks</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('ready')}
          className={`px-4 py-2 rounded ${
            filter === 'ready' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Ready for Review ({stats.ready})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-4 py-2 rounded ${
            filter === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Waiting ({stats.pending})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded ${
            filter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          All ({stats.total})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">Loading tasks...</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-600">No tasks in this category</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const isExpanded = expandedTasks.has(group.task.id)
            const hasUnreviewed = group.submissions.some(s => !s.reviewed_at)

            return (
              <div
                key={group.task.id}
                className={`bg-white border-2 rounded-lg overflow-hidden transition-all ${
                  group.is_ready
                    ? 'border-green-300 shadow-sm'
                    : 'border-gray-200'
                }`}
              >
                {/* Task Header */}
                <div
                  className="p-6 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleTaskExpansion(group.task.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <svg
                          className={`w-5 h-5 text-gray-500 transition-transform ${
                            isExpanded ? 'transform rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {group.task.title}
                        </h3>
                        {group.is_ready && hasUnreviewed && (
                          <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                            READY FOR REVIEW
                          </span>
                        )}
                      </div>
                      <div className="mt-2 ml-8 flex items-center gap-4 text-sm">
                        <span className="text-gray-600">
                          Submissions: <span className="font-semibold">{group.submitted_count}</span> / {group.task.required_submissions || group.total_assignments}
                        </span>
                        <div className="flex-1 max-w-xs bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              group.is_ready ? 'bg-green-500' : 'bg-yellow-500'
                            }`}
                            style={{
                              width: `${Math.min(100, (group.submitted_count / (group.task.required_submissions || group.total_assignments)) * 100)}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    {group.is_ready && hasUnreviewed && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCustomAnswerTaskId(group.task.id)
                          }}
                          className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded font-medium"
                        >
                          Write Custom Answer
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Approve all ${group.submissions.length} submissions for "${group.task.title}"?`)) {
                              handleBulkApprove(group.task.id)
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded font-medium"
                        >
                          Approve All
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Submissions */}
                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50">
                    {group.submissions.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        No submissions yet
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {group.submissions.map((submission, idx) => {
                          const isBest = group.task.best_submission_id === submission.id
                          return (
                            <div key={submission.id} className={`p-6 ${isBest ? 'bg-green-50' : 'bg-white'}`}>
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-700">
                                      Submission #{idx + 1}
                                    </span>
                                    <span className="text-sm text-gray-600">
                                      by {submission.labeler_email}
                                    </span>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(submission.status)}`}>
                                      {submission.status.replace('_', ' ').toUpperCase()}
                                    </span>
                                    {isBest && (
                                      <span className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs font-medium rounded">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                        Best
                                      </span>
                                    )}
                                    {submission.score !== null && (
                                      <span className="text-sm font-semibold text-indigo-600">
                                        Score: {Math.round(submission.score)}%
                                      </span>
                                    )}
                                  </div>
                                <div className="mt-2 text-sm text-gray-600">
                                  Submitted: {new Date(submission.submitted_at).toLocaleString()}
                                </div>
                                {submission.reviewed_at && (
                                  <div className="mt-1 text-sm text-gray-600">
                                    Reviewed: {new Date(submission.reviewed_at).toLocaleString()}
                                  </div>
                                )}
                                {submission.feedback && (
                                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                                    <p className="text-xs font-medium text-gray-700">Feedback:</p>
                                    <p className="text-sm text-gray-600 mt-1">{submission.feedback}</p>
                                  </div>
                                )}
                                {submission.labeler_comment && (
                                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                    <p className="text-xs font-medium text-yellow-800">Labeler Comment:</p>
                                    <p className="text-sm text-yellow-700 mt-1">{submission.labeler_comment}</p>
                                  </div>
                                )}
                              </div>
                              <div className="ml-4 flex gap-2">
                                {!isBest && submission.reviewed_at && (
                                  <button
                                    onClick={() => handleSelectBest(group.task.id, submission.id)}
                                    className="px-3 py-1 bg-indigo-600 text-white hover:bg-indigo-700 rounded text-sm font-medium"
                                  >
                                    Select as Best
                                  </button>
                                )}
                                {!submission.reviewed_at && (
                                  <>
                                    <button
                                      onClick={() => {
                                        const feedback = prompt('Enter feedback (optional):')
                                        if (feedback !== null) {
                                          handleReviewSubmission(submission.id, 'reviewed', feedback)
                                        }
                                      }}
                                      className="px-3 py-1 bg-green-600 text-white hover:bg-green-700 rounded text-sm font-medium"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => {
                                        const feedback = prompt('Enter revision feedback:')
                                        if (feedback) {
                                          handleReviewSubmission(submission.id, 'revision_requested', feedback)
                                        }
                                      }}
                                      className="px-3 py-1 bg-orange-600 text-white hover:bg-orange-700 rounded text-sm font-medium"
                                    >
                                      Request Revision
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )})}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {customAnswerTaskId && (
        <CreateCustomAnswerModal
          task={taskGroups.find(g => g.task.id === customAnswerTaskId)!.task}
          onClose={() => setCustomAnswerTaskId(null)}
          onSuccess={() => {
            setCustomAnswerTaskId(null)
            loadTaskGroups()
          }}
        />
      )}
    </div>
  )
}
