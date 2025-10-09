'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, Artifact, Rubric, TaskAssignment } from '@/types/database'

interface TaskDetailModalProps {
  taskId: string
  onClose: () => void
  onUpdate: () => void
}

interface UserProfile {
  id: string
  email: string
  role: string
}

export default function TaskDetailModal({ taskId, onClose, onUpdate }: TaskDetailModalProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [assignments, setAssignments] = useState<TaskAssignment[]>([])
  const [labelers, setLabelers] = useState<UserProfile[]>([])
  const [selectedLabelers, setSelectedLabelers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)
  const [tab, setTab] = useState<'details' | 'rubric' | 'artifacts' | 'assign'>('details')
  const supabase = createClient()

  useEffect(() => {
    loadTaskDetails()
    loadLabelers()
  }, [taskId])

  const loadTaskDetails = async () => {
    setLoading(true)

    // Load task
    const { data: taskData } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskData) setTask(taskData)

    // Load artifacts
    const { data: artifactsData } = await supabase
      .from('artifacts')
      .select('*')
      .eq('task_id', taskId)

    if (artifactsData) setArtifacts(artifactsData)

    // Load rubric
    const { data: rubricData } = await supabase
      .from('rubrics')
      .select('*')
      .eq('task_id', taskId)
      .single()

    if (rubricData) setRubric(rubricData)

    // Load assignments
    const { data: assignmentsData } = await supabase
      .from('task_assignments')
      .select('*')
      .eq('task_id', taskId)

    if (assignmentsData) {
      setAssignments(assignmentsData)
      setSelectedLabelers(assignmentsData.map(a => a.labeler_id))
    }

    setLoading(false)
  }

  const loadLabelers = async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .eq('role', 'labeler')

    if (data) setLabelers(data)
  }

  const handleAssignLabelers = async () => {
    if (!task) return
    setAssigning(true)

    try {
      // Get current assignments
      const currentAssignments = assignments.map(a => a.labeler_id)

      // Find new assignments (selected but not currently assigned)
      const newAssignments = selectedLabelers.filter(id => !currentAssignments.includes(id))

      // Find removed assignments (currently assigned but not selected)
      const removedAssignments = currentAssignments.filter(id => !selectedLabelers.includes(id))

      // Add new assignments
      if (newAssignments.length > 0) {
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData.user?.id

        const { error: insertError } = await supabase
          .from('task_assignments')
          .insert(
            newAssignments.map(labelerId => ({
              task_id: taskId,
              labeler_id: labelerId,
              assigned_by: userId,
            }))
          )

        if (insertError) throw insertError
      }

      // Remove unassigned
      if (removedAssignments.length > 0) {
        const { error: deleteError } = await supabase
          .from('task_assignments')
          .delete()
          .eq('task_id', taskId)
          .in('labeler_id', removedAssignments)

        if (deleteError) throw deleteError
      }

      // Update task status if needed
      if (selectedLabelers.length > 0 && task.status === 'draft') {
        await supabase
          .from('tasks')
          .update({ status: 'assigned' })
          .eq('id', taskId)
      }

      await loadTaskDetails()
      onUpdate()
      setTab('details')
    } catch (error) {
      console.error('Error assigning labelers:', error)
    } finally {
      setAssigning(false)
    }
  }

  const downloadArtifact = async (artifact: Artifact) => {
    const { data } = await supabase.storage
      .from('artifacts')
      .download(artifact.storage_path)

    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = artifact.file_name
      a.click()
      URL.revokeObjectURL(url)
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

  if (loading || !task) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading task details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{task.title}</h2>
              <div className="mt-2 flex items-center gap-3">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                  {task.status.replace('_', ' ').toUpperCase()}
                </span>
                {task.deadline && (
                  <span className="text-sm text-gray-600">
                    Deadline: {new Date(task.deadline).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setTab('details')}
              className={`px-4 py-2 rounded ${tab === 'details' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
            >
              Details
            </button>
            <button
              onClick={() => setTab('rubric')}
              className={`px-4 py-2 rounded ${tab === 'rubric' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
            >
              Rubric ({rubric?.schema.fields.length || 0} fields)
            </button>
            <button
              onClick={() => setTab('artifacts')}
              className={`px-4 py-2 rounded ${tab === 'artifacts' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
            >
              Artifacts ({artifacts.length})
            </button>
            <button
              onClick={() => setTab('assign')}
              className={`px-4 py-2 rounded ${tab === 'assign' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}
            >
              Assign ({assignments.length} labelers)
            </button>
          </div>
        </div>

        <div className="p-6">
          {tab === 'details' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
                <p className="text-gray-900">{task.description || 'No description provided'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Created</h3>
                  <p className="text-gray-900">{new Date(task.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Last Updated</h3>
                  <p className="text-gray-900">{new Date(task.updated_at).toLocaleString()}</p>
                </div>
              </div>

              {assignments.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Assigned To</h3>
                  <div className="space-y-1">
                    {assignments.map((assignment) => {
                      const labeler = labelers.find(l => l.id === assignment.labeler_id)
                      return (
                        <div key={assignment.id} className="flex items-center gap-2 text-sm">
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          <span>{labeler?.email || assignment.labeler_id}</span>
                          <span className="text-gray-500">
                            (assigned {new Date(assignment.assigned_at).toLocaleDateString()})
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'rubric' && rubric && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{rubric.name}</h3>
                {rubric.description && (
                  <p className="text-sm text-gray-600 mt-1">{rubric.description}</p>
                )}
              </div>

              <div className="space-y-3">
                {rubric.schema.fields.map((field, index) => (
                  <div key={field.id} className="border border-gray-200 rounded p-4 bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {index + 1}. {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Type: <span className="font-mono">{field.type}</span>
                        </p>
                        {field.helpText && (
                          <p className="text-sm text-gray-500 mt-1">{field.helpText}</p>
                        )}
                        {field.options && field.options.length > 0 && (
                          <p className="text-sm text-gray-600 mt-1">
                            Options: {field.options.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'artifacts' && (
            <div>
              {artifacts.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded border-2 border-dashed border-gray-300">
                  <p className="text-gray-600">No artifacts uploaded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {artifacts.map((artifact) => (
                    <div key={artifact.id} className="border border-gray-200 rounded p-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded flex items-center justify-center">
                          <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{artifact.file_name}</p>
                          <p className="text-sm text-gray-500">
                            {artifact.file_type.toUpperCase()} • {(artifact.file_size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadArtifact(artifact)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'assign' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Labelers to Task</h3>

              {labelers.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded border-2 border-dashed border-gray-300">
                  <p className="text-gray-600">No labelers available</p>
                  <p className="text-sm text-gray-500 mt-1">Create labeler accounts first</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {labelers.map((labeler) => (
                    <label
                      key={labeler.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLabelers.includes(labeler.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLabelers([...selectedLabelers, labeler.id])
                          } else {
                            setSelectedLabelers(selectedLabelers.filter(id => id !== labeler.id))
                          }
                        }}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="flex-1 text-gray-900">{labeler.email}</span>
                      {assignments.some(a => a.labeler_id === labeler.id) && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Currently Assigned
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}

              {labelers.length > 0 && (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleAssignLabelers}
                    disabled={assigning}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
                  >
                    {assigning ? 'Assigning...' : `Assign ${selectedLabelers.length} Labeler(s)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
