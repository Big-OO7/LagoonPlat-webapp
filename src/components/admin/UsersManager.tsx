'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'labeler'
  created_at: string
}

export default function UsersManager() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'admin' | 'labeler'>('all')
  const supabase = createClient()

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)

    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setUsers(data)
    }

    setLoading(false)
  }

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'labeler') => {
    const confirmed = confirm(`Are you sure you want to change this user's role to ${newRole}?`)
    if (!confirmed) return

    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      alert('Failed to update role: ' + error.message)
    } else {
      alert('Role updated successfully!')
      loadUsers()
    }
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    const confirmed = confirm(`Are you sure you want to delete user ${email}? This action cannot be undone.`)
    if (!confirmed) return

    // Note: This will only delete the profile. The auth.users entry remains due to RLS
    // In production, you might want to call a Supabase Edge Function to fully delete the user
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', userId)

    if (error) {
      alert('Failed to delete user: ' + error.message)
    } else {
      alert('User profile deleted successfully!')
      loadUsers()
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
                  Role
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
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {user.role.toUpperCase()}
                    </span>
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
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Change Role
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        className="text-red-600 hover:text-red-900"
                      >
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
