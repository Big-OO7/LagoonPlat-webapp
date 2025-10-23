'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface DashboardStats {
  totalTasks: number
  draftTasks: number
  activeTasks: number
  completedTasks: number
  totalSubmissions: number
  pendingReview: number
  reviewedSubmissions: number
  totalUsers: number
  totalLabelers: number
  totalAdmins: number
}

interface DashboardOverviewProps {
  profile: {
    email: string
    role: string
  }
  onNavigate: (tab: 'tasks' | 'submissions' | 'users' | 'batch_assign' | 'manage_assignments' | 'export') => void
}

export default function DashboardOverview({ profile, onNavigate }: DashboardOverviewProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    draftTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    totalSubmissions: 0,
    pendingReview: 0,
    reviewedSubmissions: 0,
    totalUsers: 0,
    totalLabelers: 0,
    totalAdmins: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setLoading(true)

    // Use count queries for better performance with large datasets
    const [
      totalTasksResult,
      draftTasksResult,
      assignedTasksResult,
      inProgressTasksResult,
      submittedTasksResult,
      reviewedTasksResult,
      completedTasksResult,
      totalSubmissionsResult,
      pendingReviewResult,
      reviewedSubmissionsResult,
      totalUsersResult,
      totalLabelersResult,
      totalAdminsResult,
    ] = await Promise.all([
      supabase.from('tasks').select('*', { count: 'exact', head: true }),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'assigned'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'reviewed'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('submissions').select('*', { count: 'exact', head: true }),
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'reviewed'),
      supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'labeler'),
      supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    ])

    const activeTasks =
      (assignedTasksResult.count || 0) +
      (inProgressTasksResult.count || 0) +
      (submittedTasksResult.count || 0)

    const completedTasks =
      (reviewedTasksResult.count || 0) +
      (completedTasksResult.count || 0)

    setStats({
      totalTasks: totalTasksResult.count || 0,
      draftTasks: draftTasksResult.count || 0,
      activeTasks,
      completedTasks,
      totalSubmissions: totalSubmissionsResult.count || 0,
      pendingReview: pendingReviewResult.count || 0,
      reviewedSubmissions: reviewedSubmissionsResult.count || 0,
      totalUsers: totalUsersResult.count || 0,
      totalLabelers: totalLabelersResult.count || 0,
      totalAdmins: totalAdminsResult.count || 0,
    })

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-2 text-gray-600">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Welcome, Admin!</h2>

      <div className="space-y-6">
        {/* Profile Info */}
        <div className="bg-gray-50 p-4 rounded">
          <p>
            <strong>Email:</strong> {profile.email}
          </p>
          <p>
            <strong>Role:</strong>{' '}
            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">
              {profile.role.toUpperCase()}
            </span>
          </p>
        </div>

        {/* Key Metrics */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Platform Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border-2 border-indigo-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Tasks</p>
                  <p className="text-3xl font-bold text-indigo-600">{stats.totalTasks}</p>
                </div>
                <svg className="w-12 h-12 text-indigo-200" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <div className="bg-white border-2 border-purple-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Review</p>
                  <p className="text-3xl font-bold text-purple-600">{stats.pendingReview}</p>
                </div>
                <svg className="w-12 h-12 text-purple-200" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <div className="bg-white border-2 border-green-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Submissions</p>
                  <p className="text-3xl font-bold text-green-600">{stats.totalSubmissions}</p>
                </div>
                <svg className="w-12 h-12 text-green-200" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            <div className="bg-white border-2 border-yellow-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Labelers</p>
                  <p className="text-3xl font-bold text-yellow-600">{stats.totalLabelers}</p>
                </div>
                <svg className="w-12 h-12 text-yellow-200" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Task Breakdown */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Task Status Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-600 mb-2">Draft Tasks</p>
              <p className="text-2xl font-bold text-gray-700">{stats.draftTasks}</p>
              <p className="text-xs text-gray-500 mt-1">Not yet assigned</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-600 mb-2">Active Tasks</p>
              <p className="text-2xl font-bold text-blue-600">{stats.activeTasks}</p>
              <p className="text-xs text-gray-500 mt-1">In progress or submitted</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-600 mb-2">Completed Tasks</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedTasks}</p>
              <p className="text-xs text-gray-500 mt-1">Reviewed or completed</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => onNavigate('tasks')}
              className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors text-left"
            >
              <h4 className="text-lg font-semibold text-indigo-900 mb-2">
                Tasks Management
              </h4>
              <p className="text-gray-600 text-sm mb-3">
                Create tasks, assign to labelers, and track progress
              </p>
              <span className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                Go to Tasks →
              </span>
            </button>

            <button
              onClick={() => onNavigate('submissions')}
              className="bg-green-50 p-4 rounded-lg border border-green-100 hover:bg-green-100 transition-colors text-left"
            >
              <h4 className="text-lg font-semibold text-green-900 mb-2">
                Submissions
              </h4>
              <p className="text-gray-600 text-sm mb-3">
                Review labeler submissions and provide feedback
              </p>
              <span className="text-green-600 hover:text-green-800 text-sm font-medium">
                Go to Submissions →
              </span>
            </button>

            <button
              onClick={() => onNavigate('users')}
              className="bg-purple-50 p-4 rounded-lg border border-purple-100 hover:bg-purple-100 transition-colors text-left"
            >
              <h4 className="text-lg font-semibold text-purple-900 mb-2">
                User Management
              </h4>
              <p className="text-gray-600 text-sm mb-3">
                Manage labelers and assign roles
              </p>
              <span className="text-purple-600 hover:text-purple-800 text-sm font-medium">
                Go to Users →
              </span>
            </button>
          </div>
        </div>

        {/* Recent Activity Summary */}
        {stats.pendingReview > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <svg className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <h4 className="text-sm font-semibold text-yellow-900">Action Required</h4>
                <p className="text-sm text-yellow-800 mt-1">
                  You have <strong>{stats.pendingReview}</strong> submission{stats.pendingReview !== 1 ? 's' : ''} waiting for review.
                </p>
                <button
                  onClick={() => onNavigate('submissions')}
                  className="mt-2 text-sm font-medium text-yellow-900 hover:text-yellow-700"
                >
                  Review now →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
