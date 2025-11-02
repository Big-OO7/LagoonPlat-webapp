'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Submission, Task } from '@/types/database'

interface FlaggedSubmission extends Submission {
  task?: Task
  labeler_email?: string
}

export default function FlaggedTasksQueue() {
  const [flaggedSubmissions, setFlaggedSubmissions] = useState<FlaggedSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unreviewed' | 'reviewed'>('unreviewed')
  const supabase = createClient()

  useEffect(() => {
    loadFlaggedSubmissions()
  }, [])

  const loadFlaggedSubmissions = async () => {
    setLoading(true)

    // Load all flagged submissions
    const { data: submissionsData, error: submissionsError } = await supabase
      .from('submissions')
      .select('*')
      .eq('flagged_unsolvable', true)
      .order('submitted_at', { ascending: false })

    if (submissionsError) {
      console.error('Error loading flagged submissions:', submissionsError)
      setLoading(false)
      return
    }

    if (!submissionsData || submissionsData.length === 0) {
      setFlaggedSubmissions([])
      setLoading(false)
      return
    }

    // Get task IDs and labeler IDs
    const taskIds = [...new Set(submissionsData.map(s => s.task_id))]
    const labelerIds = [...new Set(submissionsData.map(s => s.labeler_id))]

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

    // Combine data
    const enrichedSubmissions = submissionsData.map(sub => ({
      ...sub,
      task: tasksData?.find(t => t.id === sub.task_id),
      labeler_email: profilesData?.find(p => p.id === sub.labeler_id)?.email
    }))

    setFlaggedSubmissions(enrichedSubmissions)
    setLoading(false)
  }

  const handleResolve = async (submissionId: string, resolution: 'reviewed' | 'revision_requested') => {
    const feedback = prompt(resolution === 'reviewed'
      ? 'Enter resolution notes (optional):'
      : 'Enter feedback for labeler:')

    if (feedback === null && resolution === 'revision_requested') return

    const { error } = await supabase
      .from('submissions')
      .update({
        status: resolution,
        feedback: feedback || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
        flagged_unsolvable: false // Clear the flag when resolved
      })
      .eq('id', submissionId)

    if (error) {
      console.error('Error resolving flagged submission:', error)
      alert('Failed to resolve submission')
    } else {
      loadFlaggedSubmissions()
    }
  }

  const handleKeepFlagged = async (submissionId: string) => {
    const feedback = prompt('Enter notes about why this task is unsolvable:')
    if (!feedback) return

    const { error } = await supabase
      .from('submissions')
      .update({
        feedback: feedback,
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
        status: 'reviewed'
        // Keep flagged_unsolvable = true
      })
      .eq('id', submissionId)

    if (error) {
      console.error('Error updating flagged submission:', error)
      alert('Failed to update submission')
    } else {
      loadFlaggedSubmissions()
    }
  }

  const filteredSubmissions = flaggedSubmissions.filter(sub => {
    if (filter === 'all') return true
    if (filter === 'unreviewed') return !sub.reviewed_at
    if (filter === 'reviewed') return !!sub.reviewed_at
    return true
  })

  const stats = {
    total: flaggedSubmissions.length,
    unreviewed: flaggedSubmissions.filter(s => !s.reviewed_at).length,
    reviewed: flaggedSubmissions.filter(s => s.reviewed_at).length
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Flagged/Unsolvable Tasks</h2>
          <p className="text-sm text-gray-600 mt-1">
            Tasks that labelers have marked as incorrect or unsolvable
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Flagged</h3>
          <p className="text-3xl font-bold text-orange-600">{stats.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Needs Review</h3>
          <p className="text-3xl font-bold text-red-600">{stats.unreviewed}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Reviewed</h3>
          <p className="text-3xl font-bold text-green-600">{stats.reviewed}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setFilter('unreviewed')}
          className={`px-4 py-2 rounded ${
            filter === 'unreviewed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Needs Review ({stats.unreviewed})
        </button>
        <button
          onClick={() => setFilter('reviewed')}
          className={`px-4 py-2 rounded ${
            filter === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Reviewed ({stats.reviewed})
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

      {/* Flagged Submissions List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">Loading flagged submissions...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600 mt-2">
            {filter === 'all' ? 'No flagged submissions' : `No ${filter} flagged submissions`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSubmissions.map((submission) => (
            <div
              key={submission.id}
              className="bg-white border-2 border-orange-300 rounded-lg p-6"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-orange-100 rounded">
                      <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {submission.task?.title || 'Unknown Task'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Flagged by: <span className="font-medium">{submission.labeler_email}</span>
                      </p>
                      <p className="text-sm text-gray-500">
                        Submitted: {new Date(submission.submitted_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {submission.labeler_comment && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm font-semibold text-yellow-900">Labeler Comment:</p>
                      <p className="text-sm text-yellow-800 mt-1">{submission.labeler_comment}</p>
                    </div>
                  )}

                  {submission.feedback && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded">
                      <p className="text-sm font-medium text-gray-700">Reviewer Notes:</p>
                      <p className="text-sm text-gray-600 mt-1">{submission.feedback}</p>
                    </div>
                  )}

                  {submission.reviewed_at && (
                    <div className="mt-3 text-sm text-gray-600">
                      <span className="font-medium">Reviewed:</span> {new Date(submission.reviewed_at).toLocaleString()}
                    </div>
                  )}
                </div>

                <div className="ml-4 flex flex-col gap-2">
                  {!submission.reviewed_at && (
                    <>
                      <button
                        onClick={() => handleResolve(submission.id, 'reviewed')}
                        className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded font-medium text-sm"
                      >
                        Resolve & Approve
                      </button>
                      <button
                        onClick={() => handleResolve(submission.id, 'revision_requested')}
                        className="px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 rounded font-medium text-sm"
                      >
                        Send Back to Labeler
                      </button>
                      <button
                        onClick={() => handleKeepFlagged(submission.id)}
                        className="px-4 py-2 bg-gray-600 text-white hover:bg-gray-700 rounded font-medium text-sm"
                      >
                        Confirm Unsolvable
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
