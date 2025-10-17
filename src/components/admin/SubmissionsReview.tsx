'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Submission, Task } from '@/types/database'
import SubmissionDetailModal from './SubmissionDetailModal'

interface SubmissionWithTask extends Submission {
  task?: Task
  labeler_email?: string
  reviewer_email?: string
}

export default function SubmissionsReview() {
  const [submissions, setSubmissions] = useState<SubmissionWithTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'submitted' | 'reviewed'>('all')
  const supabase = createClient()

  useEffect(() => {
    loadSubmissions()
  }, [])

  const loadSubmissions = async () => {
    setLoading(true)

    // Load all submissions
    const { data: submissionsData } = await supabase
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false })

    if (!submissionsData) {
      setLoading(false)
      return
    }

    // Get unique task IDs, labeler IDs, and reviewer IDs
    const taskIds = [...new Set(submissionsData.map(s => s.task_id))]
    const labelerIds = [...new Set(submissionsData.map(s => s.labeler_id))]
    const reviewerIds = [...new Set(submissionsData.map(s => s.reviewed_by).filter(Boolean))]

    // Load tasks
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .in('id', taskIds)

    // Load labeler profiles
    const { data: profilesData } = await supabase
      .from('user_profiles')
      .select('id, email')
      .in('id', labelerIds)

    // Load reviewer profiles
    const { data: reviewerProfilesData } = reviewerIds.length > 0 ? await supabase
      .from('user_profiles')
      .select('id, email')
      .in('id', reviewerIds) : { data: [] }

    // Combine data
    const enrichedSubmissions = submissionsData.map(sub => ({
      ...sub,
      task: tasksData?.find(t => t.id === sub.task_id),
      labeler_email: profilesData?.find(p => p.id === sub.labeler_id)?.email,
      reviewer_email: sub.reviewed_by ? reviewerProfilesData?.find(p => p.id === sub.reviewed_by)?.email : undefined,
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
    if (filter === 'all') return true
    if (filter === 'submitted') return sub.status === 'submitted'
    if (filter === 'reviewed') return sub.status === 'reviewed'
    return true
  })

  const stats = {
    total: submissions.length,
    pending: submissions.filter(s => s.status === 'submitted').length,
    reviewed: submissions.filter(s => s.status === 'reviewed').length,
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Submissions Review</h2>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Submissions</h3>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Pending Review</h3>
          <p className="text-3xl font-bold text-purple-600">{stats.pending}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Reviewed</h3>
          <p className="text-3xl font-bold text-green-600">{stats.reviewed}</p>
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

                  {submission.feedback && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                      <p className="text-sm font-medium text-gray-700">Your Feedback:</p>
                      <p className="text-sm text-gray-600 mt-1">{submission.feedback}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedSubmissionId(submission.id)}
                  className={`ml-4 px-4 py-2 rounded font-medium ${
                    submission.status === 'submitted'
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {submission.status === 'submitted' ? 'Review' : 'View Details'}
                </button>
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
          }}
        />
      )}
    </div>
  )
}
