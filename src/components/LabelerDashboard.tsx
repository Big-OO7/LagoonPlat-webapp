'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { Task, TaskAssignment, Submission } from '@/types/database'
import LabelerTaskDetail from './labeler/LabelerTaskDetail'

interface LabelerDashboardProps {
  user: User
  profile: {
    id: string
    role: string
    email: string
  }
}

interface TaskWithSubmission extends Task {
  submission?: Submission
}

export default function LabelerDashboard({ user, profile }: LabelerDashboardProps) {
  const [tasks, setTasks] = useState<TaskWithSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadAssignedTasks()
  }, [])

  const loadAssignedTasks = async () => {
    setLoading(true)

    // Get task assignments for this labeler
    const { data: assignments } = await supabase
      .from('task_assignments')
      .select('task_id')
      .eq('labeler_id', user.id)

    if (!assignments) {
      setLoading(false)
      return
    }

    const taskIds = assignments.map(a => a.task_id)

    if (taskIds.length === 0) {
      setLoading(false)
      return
    }

    // Get tasks
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .in('id', taskIds)
      .order('deadline', { ascending: true, nullsFirst: false })

    // Get submissions for these tasks
    const { data: submissions } = await supabase
      .from('submissions')
      .select('*')
      .eq('labeler_id', user.id)
      .in('task_id', taskIds)

    // Combine tasks with their submissions
    const tasksWithSubmissions = (tasksData || []).map(task => ({
      ...task,
      submission: submissions?.find(s => s.task_id === task.id)
    }))

    setTasks(tasksWithSubmissions)
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      assigned: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-purple-100 text-purple-800',
      reviewed: 'bg-green-100 text-green-800',
      completed: 'bg-green-200 text-green-900',
      revision_requested: 'bg-orange-100 text-orange-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const pendingTasks = tasks.filter(t => !t.submission || t.submission.status === 'in_progress')
  const submittedTasks = tasks.filter(t => t.submission?.status === 'submitted' || t.submission?.status === 'reviewed' || t.submission?.status === 'completed')

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-green-600 text-white p-4">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Tabulatorum datorum notandorum Labeler</h1>
          <button
            onClick={handleLogout}
            className="bg-green-700 hover:bg-green-800 px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="container mx-auto p-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Assigned Tasks</h3>
            <p className="text-3xl font-bold text-green-600">{tasks.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Pending</h3>
            <p className="text-3xl font-bold text-yellow-600">{pendingTasks.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Submitted</h3>
            <p className="text-3xl font-bold text-purple-600">{submittedTasks.length}</p>
          </div>
        </div>

        {/* Task List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">My Tasks</h2>

          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
              <p className="mt-2 text-gray-600">Loading tasks...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-600">No tasks assigned yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Your admin will assign tasks to you
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {task.title}
                      </h3>
                      {task.description && (
                        <p className="text-gray-600 text-sm mb-3">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          task.submission
                            ? getStatusColor(task.submission.status)
                            : getStatusColor('assigned')
                        }`}>
                          {task.submission
                            ? task.submission.status.replace('_', ' ').toUpperCase()
                            : 'NOT STARTED'}
                        </span>
                        {task.deadline && (
                          <span className={`flex items-center gap-1 ${
                            new Date(task.deadline) < new Date() ? 'text-red-600 font-medium' : ''
                          }`}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Due: {new Date(task.deadline).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {task.submission?.reviewed_at && task.submission.feedback && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                          <p className="text-sm font-medium text-green-900">Admin Feedback:</p>
                          <p className="text-sm text-green-800 mt-1">{task.submission.feedback}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`px-4 py-2 rounded font-medium ${
                          task.submission
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {task.submission ? 'View Submission' : 'Start Task'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedTaskId && (
        <LabelerTaskDetail
          taskId={selectedTaskId}
          labelerId={user.id}
          onClose={() => setSelectedTaskId(null)}
          onSubmit={() => {
            setSelectedTaskId(null)
            loadAssignedTasks()
          }}
        />
      )}
    </div>
  )
}
