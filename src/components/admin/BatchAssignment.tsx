'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task } from '@/types/database'

interface UserProfile {
  id: string
  email: string
  role: string
}

export default function BatchAssignment() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [labelers, setLabelers] = useState<UserProfile[]>([])
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [selectedLabelers, setSelectedLabelers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    // Load tasks
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (tasksData) setTasks(tasksData)

    // Load labelers
    const { data: labelersData } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .eq('role', 'labeler')

    if (labelersData) setLabelers(labelersData)

    setLoading(false)
  }

  const handleBatchAssign = async () => {
    if (selectedTasks.length === 0) {
      alert('Please select at least one task')
      return
    }

    if (selectedLabelers.length === 0) {
      alert('Please select at least one labeler')
      return
    }

    const confirmed = confirm(
      `You are about to assign ${selectedTasks.length} task(s) to ${selectedLabelers.length} labeler(s). Continue?`
    )
    if (!confirmed) return

    setAssigning(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id

      // Create assignments for each task-labeler combination
      const assignments = []
      for (const taskId of selectedTasks) {
        for (const labelerId of selectedLabelers) {
          assignments.push({
            task_id: taskId,
            labeler_id: labelerId,
            assigned_by: userId,
          })
        }
      }

      // Insert all assignments (will skip duplicates due to unique constraint)
      const { error } = await supabase
        .from('task_assignments')
        .upsert(assignments, {
          onConflict: 'task_id,labeler_id',
          ignoreDuplicates: true
        })

      if (error) throw error

      // Update task statuses from draft to assigned
      for (const taskId of selectedTasks) {
        const task = tasks.find(t => t.id === taskId)
        if (task && task.status === 'draft') {
          await supabase
            .from('tasks')
            .update({ status: 'assigned' })
            .eq('id', taskId)
        }
      }

      alert(`Successfully assigned ${selectedTasks.length} task(s) to ${selectedLabelers.length} labeler(s)!`)

      // Clear selections
      setSelectedTasks([])
      setSelectedLabelers([])

      // Reload data
      await loadData()
    } catch (error) {
      console.error('Error in batch assignment:', error)
      alert('Failed to complete batch assignment. Please try again.')
    } finally {
      setAssigning(false)
    }
  }

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    )
  }

  const toggleLabelerSelection = (labelerId: string) => {
    setSelectedLabelers(prev =>
      prev.includes(labelerId)
        ? prev.filter(id => id !== labelerId)
        : [...prev, labelerId]
    )
  }

  const selectAllTasks = () => {
    if (selectedTasks.length === tasks.length) {
      setSelectedTasks([])
    } else {
      setSelectedTasks(tasks.map(t => t.id))
    }
  }

  const selectAllLabelers = () => {
    if (selectedLabelers.length === labelers.length) {
      setSelectedLabelers([])
    } else {
      setSelectedLabelers(labelers.map(l => l.id))
    }
  }

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

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-2 text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Batch Assignment</h3>
        <p className="text-sm text-blue-800">
          Select multiple tasks and labelers below, then click &quot;Assign Selected&quot; to assign all tasks to all selected labelers at once.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tasks Selection */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Select Tasks ({selectedTasks.length} selected)
              </h3>
              <button
                onClick={selectAllTasks}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {selectedTasks.length === tasks.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto space-y-2">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No tasks available
              </div>
            ) : (
              tasks.map((task) => (
                <label
                  key={task.id}
                  className={`flex items-start gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    selectedTasks.includes(task.id)
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTasks.includes(task.id)}
                    onChange={() => toggleTaskSelection(task.id)}
                    className="w-4 h-4 text-indigo-600 rounded mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-gray-600 mt-1 truncate">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                        {task.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(task.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Labelers Selection */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Select Labelers ({selectedLabelers.length} selected)
              </h3>
              <button
                onClick={selectAllLabelers}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {selectedLabelers.length === labelers.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto space-y-2">
            {labelers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No labelers available
              </div>
            ) : (
              labelers.map((labeler) => (
                <label
                  key={labeler.id}
                  className={`flex items-center gap-3 p-3 border rounded cursor-pointer transition-colors ${
                    selectedLabelers.includes(labeler.id)
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedLabelers.includes(labeler.id)}
                    onChange={() => toggleLabelerSelection(labeler.id)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{labeler.email}</p>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Assignment Summary & Action */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-900">
              Assignment Summary
            </p>
            <p className="text-sm text-indigo-700 mt-1">
              {selectedTasks.length === 0 && selectedLabelers.length === 0 && 'Select tasks and labelers to assign'}
              {selectedTasks.length > 0 && selectedLabelers.length === 0 && `${selectedTasks.length} task(s) selected - now select labelers`}
              {selectedTasks.length === 0 && selectedLabelers.length > 0 && `${selectedLabelers.length} labeler(s) selected - now select tasks`}
              {selectedTasks.length > 0 && selectedLabelers.length > 0 &&
                `Ready to create ${selectedTasks.length * selectedLabelers.length} assignment(s)`}
            </p>
          </div>
          <button
            onClick={handleBatchAssign}
            disabled={assigning || selectedTasks.length === 0 || selectedLabelers.length === 0}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assigning ? 'Assigning...' : 'Assign Selected'}
          </button>
        </div>
      </div>
    </div>
  )
}
