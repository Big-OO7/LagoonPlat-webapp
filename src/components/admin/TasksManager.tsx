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
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const supabase = createClient()
  const ITEMS_PER_PAGE = 50

  const loadTasks = async (pageNum: number = 0) => {
    setLoading(true)
    const from = pageNum * ITEMS_PER_PAGE
    const to = from + ITEMS_PER_PAGE - 1

    const { data, error, count } = await supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!error && data) {
      setTasks(data)
      setTotalCount(count || 0)
      setHasMore(data.length === ITEMS_PER_PAGE)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadTasks(page)
  }, [page])

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
      loadTasks(page)
    } catch (error) {
      alert('Failed to delete task: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    )
  }

  const selectAllTasks = () => {
    if (selectedTasks.length === tasks.length) {
      setSelectedTasks([])
    } else {
      setSelectedTasks(tasks.map(t => t.id))
    }
  }

  const handleBulkDeleteTasks = async () => {
    if (selectedTasks.length === 0) return

    const selectedTaskDetails = tasks.filter(t => selectedTasks.includes(t.id))
    const taskTitles = selectedTaskDetails.map(t => t.title).join('\n- ')

    const confirmed = confirm(
      `You are about to delete ${selectedTasks.length} task(s):\n\n- ${taskTitles}\n\nThis will also delete for ALL selected tasks:\n- Associated rubrics\n- All artifacts\n- All assignments\n- All submissions\n\nThis action cannot be undone. Continue?`
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .in('id', selectedTasks)

      if (error) throw error

      alert(`Successfully deleted ${selectedTasks.length} task(s)!`)
      setSelectedTasks([])
      await loadTasks(page)
    } catch (error) {
      console.error('Error deleting tasks:', error)
      alert('Failed to delete tasks: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  const handleDuplicateTask = async (task: Task) => {
    try {
      // Generate new title with version number
      let newTitle = task.title
      const versionMatch = task.title.match(/\s+v(\d+)$/i)

      if (versionMatch) {
        // Increment existing version number
        const currentVersion = parseInt(versionMatch[1], 10)
        newTitle = task.title.replace(/\s+v\d+$/i, ` v${currentVersion + 1}`)
      } else {
        // Add v2 to the title
        newTitle = `${task.title} v2`
      }

      // Create duplicate task
      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert({
          title: newTitle,
          description: task.description,
          prompt: task.prompt,
          graders: task.graders,
          deadline: task.deadline,
          created_by: userId,
          status: 'draft' as const,
        })
        .select()
        .single()

      if (error) throw error

      alert(`Task duplicated successfully as "${newTitle}"!`)
      await loadTasks(page)

      // Optionally open the new task for editing
      if (newTask) {
        setSelectedTaskId(newTask.id)
      }
    } catch (error) {
      console.error('Error duplicating task:', error)
      alert('Failed to duplicate task: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)
  const startItem = page * ITEMS_PER_PAGE + 1
  const endItem = Math.min((page + 1) * ITEMS_PER_PAGE, totalCount)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tasks Management</h2>
          {totalCount > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              Showing {startItem}-{endItem} of {totalCount} tasks
            </p>
          )}
        </div>
        <div className="flex gap-3">
          {tasks.length > 0 && (
            <button
              onClick={selectAllTasks}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium"
            >
              {selectedTasks.length === tasks.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            + Create New Task
          </button>
        </div>
      </div>

      {selectedTasks.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-900">
                {selectedTasks.length} task(s) selected
              </p>
              <p className="text-xs text-red-700 mt-1">
                Deleting will remove all associated data (rubrics, artifacts, assignments, submissions)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTasks([])}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium"
              >
                Clear Selection
              </button>
              <button
                onClick={handleBulkDeleteTasks}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              className={`bg-white border rounded-lg p-6 hover:shadow-md transition-shadow ${
                selectedTasks.includes(task.id)
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(task.id)}
                  onChange={() => toggleTaskSelection(task.id)}
                  className="w-5 h-5 text-indigo-600 rounded mt-1"
                />
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
                    onClick={() => handleDuplicateTask(task)}
                    className="px-3 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded text-sm font-medium"
                    title="Duplicate this task"
                  >
                    Duplicate
                  </button>
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Page <span className="font-medium">{page + 1}</span> of <span className="font-medium">{totalPages}</span>
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                  </svg>
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) {
                    pageNum = i
                  } else if (page < 3) {
                    pageNum = i
                  } else if (page > totalPages - 4) {
                    pageNum = totalPages - 5 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                        page === pageNum
                          ? 'z-10 bg-indigo-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                          : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateTaskModal
          userId={userId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            setPage(0) // Go to first page when creating new task
            loadTasks(0)
          }}
        />
      )}

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={() => loadTasks(page)}
        />
      )}
    </div>
  )
}
