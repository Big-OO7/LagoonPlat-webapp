'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'labeler' | 'super_admin'
  created_at: string
  tasks_assigned?: number
  tasks_completed?: number
  tasks_approved?: number
  tasks_revision_requested?: number
  accuracy?: number
  awaiting_tasks?: boolean
}

export default function UsersManager() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'admin' | 'labeler'>('all')
  const supabase = createClient()

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Fetch users
    const { data: usersData, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, email, role, created_at, awaiting_tasks')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(`Failed to load users: ${fetchError.message}`)
      setUsers([])
      setLoading(false)
      return
    }

    // Fetch submission counts for each user (count all actually submitted work, not drafts)
    const { data: submissionCounts, error: countError } = await supabase
      .from('submissions')
      .select('labeler_id, status')
      .in('status', ['submitted', 'reviewed', 'completed', 'revision_requested'])

    if (countError) {
      console.error('Failed to load submission counts:', countError)
    }

    // Count submissions per labeler
    const completedCountsMap: Record<string, number> = {}
    const approvedCountsMap: Record<string, number> = {}
    const revisionRequestedCountsMap: Record<string, number> = {}

    if (submissionCounts) {
      submissionCounts.forEach(submission => {
        completedCountsMap[submission.labeler_id] = (completedCountsMap[submission.labeler_id] || 0) + 1

        // Count approved tasks (reviewed or completed status)
        if (submission.status === 'reviewed' || submission.status === 'completed') {
          approvedCountsMap[submission.labeler_id] = (approvedCountsMap[submission.labeler_id] || 0) + 1
        }

        // Count tasks where edits were requested
        if (submission.status === 'revision_requested') {
          revisionRequestedCountsMap[submission.labeler_id] = (revisionRequestedCountsMap[submission.labeler_id] || 0) + 1
        }
      })
    }

    // Fetch task assignment counts for each labeler
    const { data: assignmentCounts, error: assignmentError } = await supabase
      .from('task_assignments')
      .select('labeler_id')

    if (assignmentError) {
      console.error('Failed to load assignment counts:', assignmentError)
    }

    // Count assignments per labeler
    const assignedCountsMap: Record<string, number> = {}
    if (assignmentCounts) {
      assignmentCounts.forEach(assignment => {
        assignedCountsMap[assignment.labeler_id] = (assignedCountsMap[assignment.labeler_id] || 0) + 1
      })
    }

    // Merge counts with user data
    const usersWithCounts = usersData?.map(user => {
      const approved = approvedCountsMap[user.id] || 0
      const revisionRequested = revisionRequestedCountsMap[user.id] || 0
      const totalReviewed = approved + revisionRequested
      const accuracy = totalReviewed > 0 ? (approved / totalReviewed) * 100 : 0

      return {
        ...user,
        tasks_assigned: assignedCountsMap[user.id] || 0,
        tasks_completed: completedCountsMap[user.id] || 0,
        tasks_approved: approved,
        tasks_revision_requested: revisionRequested,
        accuracy: accuracy
      }
    }) || []

    setUsers(usersWithCounts)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'labeler' | 'super_admin') => {
    const confirmed = confirm(`Are you sure you want to change this user's role to ${newRole}?`)
    if (!confirmed) return

    setActionLoading(`role-${userId}`)
    setError(null)

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)

    setActionLoading(null)

    if (updateError) {
      setError(`Failed to update role: ${updateError.message}`)
    } else {
      await loadUsers()
    }
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    const confirmed = confirm(`Are you sure you want to delete user ${email}? This action cannot be undone.`)
    if (!confirmed) return

    setActionLoading(`delete-${userId}`)
    setError(null)

    // Note: This will only delete the profile. The auth.users entry remains due to RLS
    // In production, you might want to call a Supabase Edge Function to fully delete the user
    const { error: deleteError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId)

    setActionLoading(null)

    if (deleteError) {
      setError(`Failed to delete user: ${deleteError.message}`)
    } else {
      await loadUsers()
    }
  }

  const filteredUsers = users.filter(user => {
    if (filter === 'all') return true
    return user.role === filter
  })

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    labelers: users.filter(u => u.role === 'labeler').length,
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Users Management</h2>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Total Users</h3>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Admins</h3>
          <p className="text-3xl font-bold text-purple-600">{stats.admins}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-600 mb-1">Labelers</h3>
          <p className="text-3xl font-bold text-green-600">{stats.labelers}</p>
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
          All ({users.length})
        </button>
        <button
          onClick={() => setFilter('admin')}
          className={`px-4 py-2 rounded ${
            filter === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Admins ({stats.admins})
        </button>
        <button
          onClick={() => setFilter('labeler')}
          className={`px-4 py-2 rounded ${
            filter === 'labeler' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Labelers ({stats.labelers})
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">Loading users...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-600">No users found</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tasks Assigned
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tasks Completed
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Accuracy
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.email}</div>
                    <div className="text-xs text-gray-500">{user.id.slice(0, 8)}...</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.role === 'labeler' && user.awaiting_tasks ? (
                      <span className="px-3 py-1 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        Awaiting Tasks
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-indigo-900">
                      {user.role === 'labeler' ? (user.tasks_assigned || 0) : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">
                      {user.role === 'labeler' ? (user.tasks_completed || 0) : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.role === 'labeler' ? (
                      ((user.tasks_approved || 0) + (user.tasks_revision_requested || 0)) > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className={`text-sm font-semibold ${
                            (user.accuracy || 0) >= 80 ? 'text-green-600' :
                            (user.accuracy || 0) >= 60 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {(user.accuracy || 0).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-500">
                            ({user.tasks_approved || 0}/{((user.tasks_approved || 0) + (user.tasks_revision_requested || 0))})
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">N/A</span>
                      )
                    ) : (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleRoleChange(
                          user.id,
                          user.role === 'admin' ? 'labeler' : 'admin'
                        )}
                        disabled={actionLoading === `role-${user.id}`}
                        className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {actionLoading === `role-${user.id}` && (
                          <div className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-indigo-600"></div>
                        )}
                        Change Role
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={actionLoading === `delete-${user.id}`}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {actionLoading === `delete-${user.id}` && (
                          <div className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                        )}
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-sm text-yellow-900">
          <strong>Note:</strong> Deleting a user will remove their profile and prevent them from accessing the platform.
          All their tasks and submissions will remain in the system.
        </p>
      </div>
    </div>
  )
}
