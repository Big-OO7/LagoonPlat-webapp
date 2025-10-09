'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task } from '@/types/database'
import CreateTaskModal from './CreateTaskModal'
import TaskDetailModal from './TaskDetailModal'

interface TasksManagerProps {
  userId: string
}

export default function TasksManager({ userId }: TasksManagerProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const supabase = createClient()

  const loadTasks = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setTasks(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      assigned: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      submitted: 'bg-purple-100 text-purple-800',
      reviewed: 'bg-green-100 text-green-800',
      completed: 'bg-green-200 text-green-900',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    const confirmed = confirm(
      `Are you sure you want to delete "${taskTitle}"? This will also delete:\n- Associated rubric\n- All artifacts\n- All assignments\n- All submissions\n\nThis action cannot be undone.`
    )
    if (!confirmed) return

    try {
      // Delete task (cascade will handle related records)
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)

      if (error) throw error

      alert('Task deleted successfully!')
      loadTasks()
    } catch (error) {
      alert('Failed to delete task: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Tasks Management</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          + Create New Task
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-gray-600 mb-4">No tasks created yet</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Create your first task →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
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
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                      {task.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span>
                      Created: {new Date(task.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTaskId(task.id)}
                    className="px-3 py-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded text-sm font-medium"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id, task.title)}
                    className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-sm font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateTaskModal
          userId={userId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            loadTasks()
          }}
        />
      )}

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={() => loadTasks()}
        />
      )}
    </div>
  )
}
