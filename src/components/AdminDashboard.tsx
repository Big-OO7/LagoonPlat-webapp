'use client'

import { useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import TasksManager from './admin/TasksManager'
import SubmissionsReview from './admin/SubmissionsReview'
import UsersManager from './admin/UsersManager'
import DashboardOverview from './admin/DashboardOverview'
import BatchAssignment from './admin/BatchAssignment'

interface AdminDashboardProps {
  user: User
  profile: {
    id: string
    role: string
    email: string
  }
}

type TabType = 'overview' | 'tasks' | 'submissions' | 'users' | 'batch_assign'

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
    { id: 'batch_assign' as TabType, label: 'Batch Assign' },
    { id: 'users' as TabType, label: 'Users' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-indigo-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tabulatorum datorum notandorum Admin</h1>
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
              <DashboardOverview
                profile={profile}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'tasks' && <TasksManager userId={user.id} />}
            {activeTab === 'submissions' && <SubmissionsReview />}
            {activeTab === 'batch_assign' && <BatchAssignment />}
            {activeTab === 'users' && <UsersManager />}
          </div>
        </div>
      </div>
    </div>
  )
}
