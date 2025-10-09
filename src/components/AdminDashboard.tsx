'use client'

import { useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import TasksManager from './admin/TasksManager'
import SubmissionsReview from './admin/SubmissionsReview'
import UsersManager from './admin/UsersManager'

interface AdminDashboardProps {
  user: User
  profile: {
    id: string
    role: string
    email: string
  }
}

type TabType = 'overview' | 'tasks' | 'submissions' | 'users'

export default function AdminDashboard({ user, profile }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview' },
    { id: 'tasks' as TabType, label: 'Tasks' },
    { id: 'submissions' as TabType, label: 'Submissions' },
    { id: 'users' as TabType, label: 'Users' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">LagoonPlat Admin</h1>
          <button
            onClick={handleLogout}
            className="bg-indigo-700 hover:bg-indigo-800 px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="container mx-auto p-8">
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Welcome, Admin!</h2>
                <div className="space-y-4">
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                      <h3 className="text-lg font-semibold text-indigo-900 mb-2">
                        Tasks Management
                      </h3>
                      <p className="text-gray-600 text-sm">
                        Create tasks, assign to labelers, and track progress
                      </p>
                      <button
                        onClick={() => setActiveTab('tasks')}
                        className="mt-3 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      >
                        Go to Tasks →
                      </button>
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                      <h3 className="text-lg font-semibold text-green-900 mb-2">
                        Submissions
                      </h3>
                      <p className="text-gray-600 text-sm">
                        Review labeler submissions and provide feedback
                      </p>
                      <button
                        onClick={() => setActiveTab('submissions')}
                        className="mt-3 text-green-600 hover:text-green-800 text-sm font-medium"
                      >
                        Go to Submissions →
                      </button>
                    </div>

                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                      <h3 className="text-lg font-semibold text-purple-900 mb-2">
                        User Management
                      </h3>
                      <p className="text-gray-600 text-sm">
                        Manage labelers and assign roles
                      </p>
                      <button
                        onClick={() => setActiveTab('users')}
                        className="mt-3 text-purple-600 hover:text-purple-800 text-sm font-medium"
                      >
                        Go to Users →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tasks' && <TasksManager userId={user.id} />}
            {activeTab === 'submissions' && <SubmissionsReview />}
            {activeTab === 'users' && <UsersManager />}
          </div>
        </div>
      </div>
    </div>
  )
}
