'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Assignment {
  id: string
  task_id: string
  labeler_id: string
  assigned_at: string
  task_title: string
  task_status: string
  labeler_email: string
  has_submission: boolean
}


interface Labeler {
  id: string
  email: string
}

export default function AssignmentManager() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [filteredAssignments, setFilteredAssignments] = useState<Assignment[]>([])
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [reassigning, setReassigning] = useState(false)
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [labelers, setLabelers] = useState<Labeler[]>([])
  const [selectedLabelerId, setSelectedLabelerId] = useState('')

  // Filter states
  const [taskFilter, setTaskFilter] = useState('')
  const [labelerFilter, setLabelerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Stats state - loaded via count queries for accuracy
  const [totalAssignments, setTotalAssignments] = useState(0)

  const supabase = createClient()

  useEffect(() => {
    loadAssignments()
    loadLabelers()
    loadTotalCount()
  }, [])

  const loadTotalCount = async () => {
    // Use count query to get accurate total count (not limited to 1000)
    const { count } = await supabase
      .from('task_assignments')
      .select('*', { count: 'exact', head: true })

    setTotalAssignments(count || 0)
  }

  useEffect(() => {
    applyFilters()
  }, [assignments, taskFilter, labelerFilter, statusFilter])

  const loadAssignments = async () => {
    setLoading(true)
    try {
      // Get ALL assignments without limit using multiple range queries if needed
      // Supabase default limit is 1000, so we need to fetch in batches
      const PAGE_SIZE = 1000
      let allAssignments: Array<{ id: string; task_id: string; labeler_id: string; assigned_at: string }> = []
      let page = 0
      let hasMore = true

      while (hasMore) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error } = await supabase
          .from('task_assignments')
          .select('id, task_id, labeler_id, assigned_at')
          .order('assigned_at', { ascending: false })
          .range(from, to)

        if (error) throw error

        if (data && data.length > 0) {
          allAssignments = [...allAssignments, ...data]
          hasMore = data.length === PAGE_SIZE
          page++
        } else {
          hasMore = false
        }
      }

      const assignmentsData = allAssignments
      const assignmentsError = null

      if (assignmentsError) throw assignmentsError
      if (!assignmentsData) {
        setAssignments([])
        setLoading(false)
        return
      }

      // Get unique task IDs and labeler IDs
      const taskIds = [...new Set(assignmentsData.map(a => a.task_id))]
      const labelerIds = [...new Set(assignmentsData.map(a => a.labeler_id))]

      // Batch fetch tasks to avoid URL length limits
      const BATCH_SIZE = 100
      const taskBatches: string[][] = []
      for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
        taskBatches.push(taskIds.slice(i, i + BATCH_SIZE))
      }

      const taskPromises = taskBatches.map(batch =>
        supabase.from('tasks').select('id, title, status').in('id', batch)
      )
      const taskResults = await Promise.all(taskPromises)

      // Check for errors in any batch
      const tasksError = taskResults.find(r => r.error)?.error
      if (tasksError) throw tasksError

      // Combine all task data
      const tasksData = taskResults.flatMap(r => r.data || [])

      // Batch fetch user profiles to avoid URL length limits
      const labelerBatches: string[][] = []
      for (let i = 0; i < labelerIds.length; i += BATCH_SIZE) {
        labelerBatches.push(labelerIds.slice(i, i + BATCH_SIZE))
      }

      const profilePromises = labelerBatches.map(batch =>
        supabase.from('user_profiles').select('id, email').in('id', batch)
      )
      const profileResults = await Promise.all(profilePromises)

      // Check for errors in any batch
      const profilesError = profileResults.find(r => r.error)?.error
      if (profilesError) throw profilesError

      // Combine all profile data
      const profilesData = profileResults.flatMap(r => r.data || [])

      // Get all submissions to check which assignments have submissions
      // Only count submissions that have actually been submitted (not drafts)
      const { data: submissionsData, error: submissionsError } = await supabase
        .from('submissions')
        .select('task_id, labeler_id, status')
        .in('status', ['submitted', 'reviewed', 'completed', 'revision_requested'])

      if (submissionsError) throw submissionsError

      // Map the data
      const mappedAssignments: Assignment[] = assignmentsData.map(assignment => {
        const task = tasksData?.find(t => t.id === assignment.task_id)
        const profile = profilesData?.find(p => p.id === assignment.labeler_id)

        return {
          id: assignment.id,
          task_id: assignment.task_id,
          labeler_id: assignment.labeler_id,
          assigned_at: assignment.assigned_at,
          task_title: task?.title || 'Unknown Task',
          task_status: task?.status || 'unknown',
          labeler_email: profile?.email || 'Unknown User',
          has_submission: submissionsData?.some(
            s => s.task_id === assignment.task_id && s.labeler_id === assignment.labeler_id
          ) || false
        }
      })

      setAssignments(mappedAssignments)
    } catch (error) {
      console.error('Error loading assignments:', error)
      alert('Failed to load assignments. Please check the console for details.')
    } finally {
      setLoading(false)
    }
  }

  const loadLabelers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email')
        .eq('role', 'labeler')
        .order('email', { ascending: true })

      if (error) throw error
      setLabelers(data || [])
    } catch (error) {
      console.error('Error loading labelers:', error)
    }
  }

  const handleBulkReassign = async () => {
    if (!selectedLabelerId) {
      alert('Please select a labeler to reassign to')
      return
    }

    const selectedLabeler = labelers.find(l => l.id === selectedLabelerId)
    if (!selectedLabeler) return

    const selectedData = assignments.filter(a => selectedAssignments.includes(a.id))
    const uniqueTasks = new Set(selectedData.map(a => a.task_id)).size
    const uniqueLabelers = new Set(selectedData.map(a => a.labeler_id)).size

    let confirmMessage = `You are about to reassign ${selectedAssignments.length} assignment(s) to ${selectedLabeler.email}:\n\n`
    confirmMessage += `- Affecting ${uniqueTasks} task(s)\n`
    confirmMessage += `- From ${uniqueLabelers} labeler(s)\n\n`
    confirmMessage += `This action cannot be undone. Continue?`

    const confirmed = confirm(confirmMessage)
    if (!confirmed) return

    setReassigning(true)
    try {
      const { error } = await supabase
        .from('task_assignments')
        .update({ labeler_id: selectedLabelerId })
        .in('id', selectedAssignments)

      if (error) throw error

      // Clear awaiting_tasks flag for the labeler receiving new assignments
      await supabase
        .from('user_profiles')
        .update({ awaiting_tasks: false })
        .eq('id', selectedLabelerId)

      alert(`Successfully reassigned ${selectedAssignments.length} assignment(s) to ${selectedLabeler.email}!`)
      setSelectedAssignments([])
      setShowReassignModal(false)
      setSelectedLabelerId('')
      await loadAssignments()
      await loadTotalCount()
    } catch (error) {
      console.error('Error reassigning assignments:', error)
      alert('Failed to reassign assignments: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setReassigning(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...assignments]

    if (taskFilter) {
      filtered = filtered.filter(a =>
        a.task_title.toLowerCase().includes(taskFilter.toLowerCase())
      )
    }

    if (labelerFilter) {
      filtered = filtered.filter(a =>
        a.labeler_email.toLowerCase().includes(labelerFilter.toLowerCase())
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.task_status === statusFilter)
    }

    setFilteredAssignments(filtered)
  }

  const toggleAssignmentSelection = (assignmentId: string) => {
    setSelectedAssignments(prev =>
      prev.includes(assignmentId)
        ? prev.filter(id => id !== assignmentId)
        : [...prev, assignmentId]
    )
  }

  const selectAllFiltered = () => {
    if (selectedAssignments.length === filteredAssignments.length) {
      setSelectedAssignments([])
    } else {
      setSelectedAssignments(filteredAssignments.map(a => a.id))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedAssignments.length === 0) return

    const selectedData = assignments.filter(a => selectedAssignments.includes(a.id))
    const withSubmissions = selectedData.filter(a => a.has_submission)
    const uniqueTasks = new Set(selectedData.map(a => a.task_id)).size
    const uniqueLabelers = new Set(selectedData.map(a => a.labeler_id)).size

    let confirmMessage = `You are about to delete ${selectedAssignments.length} assignment(s):\n\n`
    confirmMessage += `- Affecting ${uniqueTasks} task(s)\n`
    confirmMessage += `- Affecting ${uniqueLabelers} labeler(s)\n\n`

    if (withSubmissions.length > 0) {
      confirmMessage += `⚠️ WARNING: ${withSubmissions.length} assignment(s) have existing submissions.\n`
      confirmMessage += `Deleting these assignments will NOT delete the submissions, but labelers will lose access to view them.\n\n`
    }

    confirmMessage += `This action cannot be undone. Continue?`

    const confirmed = confirm(confirmMessage)
    if (!confirmed) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('task_assignments')
        .delete()
        .in('id', selectedAssignments)

      if (error) throw error

      alert(`Successfully deleted ${selectedAssignments.length} assignment(s)!`)
      setSelectedAssignments([])
      await loadAssignments()
      await loadTotalCount()
    } catch (error) {
      console.error('Error deleting assignments:', error)
      alert('Failed to delete assignments: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setDeleting(false)
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

  const uniqueStatuses = Array.from(new Set(assignments.map(a => a.task_status)))

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-2 text-gray-600">Loading assignments...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Assignment Manager</h3>
        <p className="text-sm text-blue-800">
          View and manage all task assignments. Select multiple assignments and delete them in bulk.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Name
            </label>
            <input
              type="text"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              placeholder="Filter by task name..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Labeler Email
            </label>
            <input
              type="text"
              value={labelerFilter}
              onChange={(e) => setLabelerFilter(e.target.value)}
              placeholder="Filter by labeler email..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map(status => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Showing {filteredAssignments.length} of {totalAssignments} total assignment(s)
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedAssignments.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-900">
                {selectedAssignments.length} assignment(s) selected
              </p>
              <p className="text-xs text-indigo-700 mt-1">
                Affecting {new Set(assignments.filter(a => selectedAssignments.includes(a.id)).map(a => a.task_id)).size} task(s)
                {' '}and {new Set(assignments.filter(a => selectedAssignments.includes(a.id)).map(a => a.labeler_id)).size} labeler(s)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedAssignments([])}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-medium"
              >
                Clear Selection
              </button>
              <button
                onClick={() => setShowReassignModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium"
              >
                Reassign Selected
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignments List */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Assignments ({filteredAssignments.length})
            </h3>
            <button
              onClick={selectAllFiltered}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {selectedAssignments.length === filteredAssignments.length && filteredAssignments.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {assignments.length === 0
                ? 'No assignments found. Use Batch Assign to create assignments.'
                : 'No assignments match the current filters.'
              }
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="w-12 px-4 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Task
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Labeler
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Submission
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAssignments.map((assignment) => (
                  <tr
                    key={assignment.id}
                    className={selectedAssignments.includes(assignment.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedAssignments.includes(assignment.id)}
                        onChange={() => toggleAssignmentSelection(assignment.id)}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {assignment.task_title}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {assignment.labeler_email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(assignment.task_status)}`}>
                        {assignment.task_status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(assignment.assigned_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {assignment.has_submission ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Not Started
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600">Total Assignments</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalAssignments}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600">With Submissions</div>
          <div className="text-2xl font-bold text-green-600 mt-1">
            {assignments.filter(a => a.has_submission).length}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600">Unique Tasks</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">
            {new Set(assignments.map(a => a.task_id)).size}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600">Unique Labelers</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">
            {new Set(assignments.map(a => a.labeler_id)).size}
          </div>
        </div>
      </div>

      {/* Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Reassign Assignments</h3>

            <p className="text-sm text-gray-600 mb-4">
              Select a labeler to reassign {selectedAssignments.length} assignment(s) to:
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Labeler
              </label>
              <select
                value={selectedLabelerId}
                onChange={(e) => setSelectedLabelerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select a labeler...</option>
                {labelers.map(labeler => (
                  <option key={labeler.id} value={labeler.id}>
                    {labeler.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowReassignModal(false)
                  setSelectedLabelerId('')
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 font-medium"
                disabled={reassigning}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReassign}
                disabled={!selectedLabelerId || reassigning}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reassigning ? 'Reassigning...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
