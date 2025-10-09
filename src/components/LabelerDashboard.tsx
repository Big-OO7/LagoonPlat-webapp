'use client'

import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface LabelerDashboardProps {
  user: User
  profile: {
    id: string
    role: string
    email: string
  }
}

export default function LabelerDashboard({ user, profile }: LabelerDashboardProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div>
      <nav className="bg-green-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Labeler Dashboard</h1>
          <button
            onClick={handleLogout}
            className="bg-green-700 hover:bg-green-800 px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="container mx-auto p-8">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Welcome, Labeler!</h2>
          <div className="space-y-2">
            <p>
              <strong>Email:</strong> {profile.email}
            </p>
            <p>
              <strong>Role:</strong>{' '}
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                {profile.role.toUpperCase()}
              </span>
            </p>
            <p>
              <strong>User ID:</strong> {user.id}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-2">My Tasks</h3>
            <p className="text-gray-600">View and complete assigned labeling tasks</p>
            <div className="mt-4">
              <p className="text-3xl font-bold text-green-600">0</p>
              <p className="text-sm text-gray-500">Pending tasks</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-2">Completed Work</h3>
            <p className="text-gray-600">Track your labeling progress</p>
            <div className="mt-4">
              <p className="text-3xl font-bold text-green-600">0</p>
              <p className="text-sm text-gray-500">Tasks completed</p>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded mt-6">
          <strong>Labeler Access:</strong> You can view and complete assigned labeling tasks. More labeling features will be added here.
        </div>
      </div>
    </div>
  )
}
