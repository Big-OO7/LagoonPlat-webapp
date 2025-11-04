'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Submission, Task } from '@/types/database'
import SubmissionDetailModal from './SubmissionDetailModal'
import CompareSubmissionsModal from './CompareSubmissionsModal'

interface SubmissionWithTask extends Submission {
  task?: Task
  labeler_email?: string
  reviewer_email?: string
  submission_count?: number
}

export default function SubmissionsReview() {
  const [submissions, setSubmissions] = useState<SubmissionWithTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [compareTaskId, setCompareTaskId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'submitted' | 'reviewed' | 'revision_requested'>('all')
  const supabase = createClient()

  useEffect(() => {
    loadSubmissions()
    loadStats()
  }, [])

  const loadStats = async () => {
    // Use count queries to get accurate stats for ALL submissions (not limited to 1000)
    // Key insight: A submission is "reviewed" if it has a reviewed_at timestamp
    // "Pending Review" means submitted_at exists but reviewed_at does not
    const [
      totalResult,
      pendingResult,
      reviewedResult,
      revisionRequestedResult,
      inProgressResult,
      exportedResult,
    ] = await Promise.all([
      // Total submissions that have been submitted
      supabase.from('submissions').select('*', { count: 'exact', head: true }).not('submitted_at', 'is', null),
      // Pending Review: submitted but not yet reviewed
      supabase.from('submissions').select('*', { count: 'exact', head: true }).not('submitted_at', 'is', null).is('reviewed_at', null),
      // Reviewed: has been reviewed (reviewed_at is set) and NOT marked for revision
      supabase.from('submissions').select('*', { count: 'exact', head: true }).not('reviewed_at', 'is', null).neq('status', 'revision_requested'),
      // Requested Edits: specifically marked for revision
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'revision_requested'),
      // In Progress: true drafts (no submitted_at timestamp)
      supabase.from('submissions').select('*', { count: 'exact', head: true }).is('submitted_at', null),
      // Exported: Count tasks that have been exported (checked via tasks table)
      supabase.from('tasks').select('*', { count: 'exact', head: true }).not('last_exported_at', 'is', null),
    ])

    setStats({
      total: totalResult.count || 0,
      pending: pendingResult.count || 0,
      reviewed: reviewedResult.count || 0,
      revisionRequested: revisionRequestedResult.count || 0,
      inProgress: inProgressResult.count || 0,
      completed: exportedResult.count || 0, // Now shows exported tasks count
    })
  }

  const loadSubmissions = async () => {
    setLoading(true)

    // Load all submissions without row limits
    // Supabase has a default limit of 1000 rows, so we need to paginate
    let allSubmissions: Submission[] = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data: submissionsData, error } = await supabase
        .from('submissions')
        .select('*')
        .order('submitted_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (error) {
        console.error('Error loading submissions:', error)
        break
      }

      if (!submissionsData || submissionsData.length === 0) {
        hasMore = false
        break
      }

      allSubmissions = [...allSubmissions, ...submissionsData]

      // If we got less than pageSize rows, we've reached the end
      if (submissionsData.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    if (allSubmissions.length === 0) {
      setLoading(false)
      return
    }

    const submissionsData = allSubmissions

    // Get unique task IDs, labeler IDs, and reviewer IDs
    const taskIds = [...new Set(submissionsData.map(s => s.task_id))]
    const labelerIds = [...new Set(submissionsData.map(s => s.labeler_id))]
    const reviewerIds = [...new Set(submissionsData.map(s => s.reviewed_by).filter((id): id is string => id !== null))]

    console.log('Loading data for:', {
      submissions: submissionsData.length,
      uniqueTasks: taskIds.length,
      uniqueLabelers: labelerIds.length,
      uniqueReviewers: reviewerIds.length
    })

    // Batch fetch tasks to avoid URL length limits
    const BATCH_SIZE = 100
    const taskBatches: string[][] = []
    for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
      taskBatches.push(taskIds.slice(i, i + BATCH_SIZE))
    }

    const taskPromises = taskBatches.map(batch =>
      supabase.from('tasks').select('*').in('id', batch)
    )
    const taskResults = await Promise.all(taskPromises)

    // Check for errors and combine results
    const taskError = taskResults.find(r => r.error)?.error
    if (taskError) {
      console.error('Error loading tasks:', taskError)
    }
    const tasksData = taskResults.flatMap(r => r.data || [])

    // Batch fetch labeler profiles
    const labelerBatches: string[][] = []
    for (let i = 0; i < labelerIds.length; i += BATCH_SIZE) {
      labelerBatches.push(labelerIds.slice(i, i + BATCH_SIZE))
    }

    const labelerPromises = labelerBatches.map(batch =>
      supabase.from('user_profiles').select('id, email').in('id', batch)
    )
    const labelerResults = await Promise.all(labelerPromises)

    const labelerError = labelerResults.find(r => r.error)?.error
    if (labelerError) {
      console.error('Error loading labelers:', labelerError)
    }
    const profilesData = labelerResults.flatMap(r => r.data || [])

    // Batch fetch reviewer profiles
    let reviewerProfilesData: { id: string; email: string }[] = []
    if (reviewerIds.length > 0) {
      const reviewerBatches: string[][] = []
      for (let i = 0; i < reviewerIds.length; i += BATCH_SIZE) {
        reviewerBatches.push(reviewerIds.slice(i, i + BATCH_SIZE))
      }

      const reviewerPromises = reviewerBatches.map(batch =>
        supabase.from('user_profiles').select('id, email').in('id', batch)
      )
      const reviewerResults = await Promise.all(reviewerPromises)

      const reviewerError = reviewerResults.find(r => r.error)?.error
      if (reviewerError) {
        console.error('Error loading reviewers:', reviewerError)
      }
      reviewerProfilesData = reviewerResults.flatMap(r => r.data || [])
    }

    // Count submissions per task
    const submissionCounts = new Map<string, number>()
    submissionsData.forEach(sub => {
      submissionCounts.set(sub.task_id, (submissionCounts.get(sub.task_id) || 0) + 1)
    })

    // Combine data
    const enrichedSubmissions = submissionsData.map(sub => ({
      ...sub,
      task: tasksData?.find(t => t.id === sub.task_id),
      labeler_email: profilesData?.find(p => p.id === sub.labeler_id)?.email,
      reviewer_email: sub.reviewed_by ? reviewerProfilesData?.find(p => p.id === sub.reviewed_by)?.email : undefined,
      submission_count: submissionCounts.get(sub.task_id) || 1,
    }))

    setSubmissions(enrichedSubmissions)
    setLoading(false)
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

  const getDisplayStatus = (submission: SubmissionWithTask): string => {
    // If submission has submitted_at but status is in_progress, treat it as submitted
    if (submission.status === 'in_progress' && submission.submitted_at) {
      return 'submitted'
    }
    return submission.status
  }

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

  const filteredSubmissions = submissions.filter(sub => {
    // ALWAYS exclude flagged tasks from regular submissions review
    // Flagged tasks should only appear in the "Flagged Tasks" queue
    if (sub.flagged_unsolvable) return false

    if (filter === 'all') return true
    // Pending Review: submitted but not yet reviewed (matches stats logic)
    if (filter === 'submitted') return sub.submitted_at !== null && sub.reviewed_at === null
    // Reviewed: has been reviewed and NOT marked for revision
    if (filter === 'reviewed') return sub.reviewed_at !== null && sub.status !== 'revision_requested'
    if (filter === 'revision_requested') return sub.status === 'revision_requested'
    return true
  })

  // Stats state - loaded via count queries for accuracy
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    reviewed: 0,
    revisionRequested: 0,
    inProgress: 0,
    completed: 0,
  })

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Submissions Review</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Submissions</h3>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Pending Review</h3>
          <p className="text-3xl font-bold text-purple-600">{stats.pending}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Requested Edits</h3>
          <p className="text-3xl font-bold text-orange-600">{stats.revisionRequested}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Reviewed</h3>
          <p className="text-3xl font-bold text-green-600">{stats.reviewed}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">In Progress</h3>
          <p className="text-3xl font-bold text-yellow-600">{stats.inProgress}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Exported</h3>
          <p className="text-3xl font-bold text-blue-600">{stats.completed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded ${
            filter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          All ({submissions.length})
        </button>
        <button
          onClick={() => setFilter('submitted')}
          className={`px-4 py-2 rounded ${
            filter === 'submitted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Pending Review ({stats.pending})
        </button>
        <button
          onClick={() => setFilter('revision_requested')}
          className={`px-4 py-2 rounded ${
            filter === 'revision_requested' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Requested Edits ({stats.revisionRequested})
        </button>
        <button
          onClick={() => setFilter('reviewed')}
          className={`px-4 py-2 rounded ${
            filter === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Reviewed ({stats.reviewed})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">Loading submissions...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-600">
            {filter === 'all' ? 'No submissions yet' : `No ${filter} submissions`}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Submissions will appear here when labelers submit their work
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSubmissions.map((submission) => (
            <div
              key={submission.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {submission.task?.title || 'Unknown Task'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Submitted by: <span className="font-medium">{submission.labeler_email}</span>
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded text-sm font-medium ${getStatusColor(getDisplayStatus(submission))}`}>
                      {getStatusLabel(getDisplayStatus(submission))}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Submitted: {new Date(submission.submitted_at).toLocaleString()}
                    </span>
                    {submission.reviewed_at && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Reviewed: {new Date(submission.reviewed_at).toLocaleString()}
                      </span>
                    )}
                    {submission.reviewer_email && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Reviewed by: <span className="font-medium text-gray-700">{submission.reviewer_email}</span>
                      </span>
                    )}
                  </div>

                  {submission.labeler_comment && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm font-medium text-yellow-900">Labeler Comment:</p>
                      <p className="text-sm text-yellow-800 mt-1">{submission.labeler_comment}</p>
                    </div>
                  )}

                  {submission.feedback && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                      <p className="text-sm font-medium text-gray-700">Your Feedback:</p>
                      <p className="text-sm text-gray-600 mt-1">{submission.feedback}</p>
                    </div>
                  )}
                </div>

                <div className="ml-4 flex gap-2">
                  {submission.submission_count && submission.submission_count > 1 && (
                    <button
                      onClick={() => setCompareTaskId(submission.task_id)}
                      className="px-4 py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Compare ({submission.submission_count})
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedSubmissionId(submission.id)}
                    className={`px-4 py-2 rounded font-medium ${
                      submission.status === 'submitted'
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {submission.status === 'submitted' ? 'Review' : 'View Details'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSubmissionId && (
        <SubmissionDetailModal
          submissionId={selectedSubmissionId}
          onClose={() => setSelectedSubmissionId(null)}
          onUpdate={() => {
            setSelectedSubmissionId(null)
            loadSubmissions()
            loadStats()
          }}
        />
      )}

      {compareTaskId && (
        <CompareSubmissionsModal
          taskId={compareTaskId}
          onClose={() => setCompareTaskId(null)}
          onUpdate={() => {
            setCompareTaskId(null)
            loadSubmissions()
            loadStats()
          }}
        />
      )}
    </div>
  )
}
