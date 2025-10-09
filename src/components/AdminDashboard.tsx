'use client'

import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface AdminDashboardProps {
  user: User
  profile: {
    id: string
    role: string
    email: string
  }
}

export default function AdminDashboard({ user, profile }: AdminDashboardProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div>
      <nav className="bg-indigo-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <button
            onClick={handleLogout}
            className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="container mx-auto p-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, Admin!</h2>
          <div className="space-y-2">
            <p>
              <strong>Email:</strong> {profile.email}
            </p>
            <p>
              <strong>Role:</strong>{' '}
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                {profile.role.toUpperCase()}
              </span>
            </p>
            <p>
              <strong>User ID:</strong> {user.id}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-2">User Management</h3>
            <p className="text-gray-600">Manage users and their roles</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-2">Data Labeling Tasks</h3>
            <p className="text-gray-600">Create and assign labeling tasks</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-2">Analytics</h3>
            <p className="text-gray-600">View labeling progress and metrics</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded mt-6">
          <strong>Admin Access:</strong> You have full administrative privileges. You can add more features specific to admin functionality here.
        </div>
      </div>
    </div>
  )
}
