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
  const [awaitingTasks, setAwaitingTasks] = useState(false)
  const [awaitingLoading, setAwaitingLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadAssignedTasks()
    loadAwaitingStatus()
  }, [])

  const loadAwaitingStatus = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('awaiting_tasks')
      .eq('id', user.id)
      .single()

    if (data) {
      setAwaitingTasks(data.awaiting_tasks || false)
    }
  }

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

  const handleToggleAwaitingTasks = async () => {
    setAwaitingLoading(true)

    const newStatus = !awaitingTasks
    const { error } = await supabase
      .from('user_profiles')
      .update({ awaiting_tasks: newStatus })
      .eq('id', user.id)

    if (!error) {
      setAwaitingTasks(newStatus)
    }

    setAwaitingLoading(false)
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

  const pendingTasks = tasks.filter(t => !t.submission || t.submission.status === 'in_progress' || t.submission.status === 'revision_requested')
  const submittedTasks = tasks.filter(t => t.submission?.status === 'submitted' || t.submission?.status === 'reviewed' || t.submission?.status === 'completed')
  const revisionTasks = tasks.filter(t => t.submission?.status === 'revision_requested')

  // Calculate overall accuracy percentage
  const gradedSubmissions = tasks.filter(t =>
    t.submission?.grader_results &&
    typeof t.submission.grader_results === 'object' &&
    'percentageScore' in t.submission.grader_results
  )
  const overallAccuracy = gradedSubmissions.length > 0
    ? gradedSubmissions.reduce((sum, t) => {
        const results = t.submission!.grader_results as { percentageScore: number }
        return sum + results.percentageScore
      }, 0) / gradedSubmissions.length
    : null

  // Check if all tasks have been submitted (no pending tasks)
  const allTasksSubmitted = tasks.length > 0 && pendingTasks.length === 0

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gradient-to-r from-green-600 via-green-700 to-emerald-600 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a
              href="https://www.withmetis.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-2xl font-bold hover:text-green-200 transition-colors duration-200"
            >
              Metis
            </a>
            <span className="text-white/30 text-2xl font-thin">|</span>
            <h1 className="text-2xl font-black bg-gradient-to-r from-yellow-200 via-pink-200 to-blue-200 bg-clip-text text-transparent hover:from-yellow-300 hover:via-pink-300 hover:to-blue-300 transition-all duration-300 cursor-default select-none tracking-wide" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              NeoForge
            </h1>
            <span className="text-xs bg-green-500/50 px-2 py-1 rounded-full font-semibold">Labeler</span>
          </div>
          <button
            onClick={handleLogout}
            className="bg-green-700 hover:bg-green-800 px-4 py-2 rounded transition-colors duration-200"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="container mx-auto p-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Assigned Tasks</h3>
            <p className="text-3xl font-bold text-green-600">{tasks.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Pending</h3>
            <p className="text-3xl font-bold text-yellow-600">{pendingTasks.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Needs Revision</h3>
            <p className="text-3xl font-bold text-orange-600">{revisionTasks.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Submitted</h3>
            <p className="text-3xl font-bold text-purple-600">{submittedTasks.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-sm font-medium text-gray-600 mb-2">Accuracy</h3>
            {overallAccuracy !== null ? (
              <p className={`text-3xl font-bold ${
                overallAccuracy >= 90 ? 'text-green-600' :
                overallAccuracy >= 70 ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {overallAccuracy.toFixed(1)}%
              </p>
            ) : (
              <p className="text-2xl text-gray-400">N/A</p>
            )}
          </div>
        </div>

        {/* Awaiting Tasks Button */}
        {allTasksSubmitted && (
          <div className="mb-6">
            <button
              onClick={handleToggleAwaitingTasks}
              disabled={awaitingLoading}
              className={`w-full py-4 px-6 rounded-lg font-semibold text-white transition-all duration-200 flex items-center justify-center gap-3 ${
                awaitingTasks
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg`}
            >
              {awaitingLoading ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Updating...</span>
                </>
              ) : awaitingTasks ? (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Awaiting New Tasks - Click to Cancel</span>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Request New Tasks</span>
                </>
              )}
            </button>
            {awaitingTasks && (
              <p className="text-center text-sm text-green-600 mt-2 font-medium">
                Your admin will be notified that you&apos;re ready for new assignments
              </p>
            )}
          </div>
        )}

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
                        {task.submission?.grader_results &&
                          typeof task.submission.grader_results === 'object' &&
                          'percentageScore' in task.submission.grader_results && (
                          <span className={`px-2 py-1 rounded text-xs font-bold ${
                            (task.submission.grader_results as { percentageScore: number }).percentageScore >= 90
                              ? 'bg-green-100 text-green-800'
                              : (task.submission.grader_results as { percentageScore: number }).percentageScore >= 70
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            Accuracy: {((task.submission.grader_results as { percentageScore: number }).percentageScore).toFixed(1)}%
                          </span>
                        )}
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
