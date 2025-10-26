'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, GraderConfig, Submission } from '@/types/database'

interface TaskWithSelection extends Task {
  selected: boolean
  submissionData?: Submission // Store the reviewed submission data
}

export default function ExportTasks() {
  const [tasks, setTasks] = useState<TaskWithSelection[]>([])
  const [loading, setLoading] = useState(true)
  const [exportJson, setExportJson] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState<'all' | 'with_comments' | 'without_comments'>('all')
  const [exporterEmails, setExporterEmails] = useState<Record<string, string>>({})
  const [currentExportTaskIds, setCurrentExportTaskIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [exportStatusFilter, setExportStatusFilter] = useState<'all' | 'exported' | 'not_exported'>('all')
  const [markingExported, setMarkingExported] = useState(false)
  const [exportMarked, setExportMarked] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadCompletedTasks()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadCompletedTasks = async () => {
    setLoading(true)

    // Get all submissions that have been reviewed (have reviewed_at timestamp)
    // Status doesn't matter - what matters is if it's been reviewed by an admin
    // Load with pagination to avoid Supabase 1000 row limit
    let allReviewedSubmissions: Submission[] = []
    let page = 0
    const pageSize = 1000
    let hasMore = true

    while (hasMore) {
      const { data: reviewedSubmissions, error: submissionsError } = await supabase
        .from('submissions')
        .select('*')
        .not('reviewed_at', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (submissionsError) {
        console.error('Error loading submissions:', submissionsError)
        break
      }

      if (!reviewedSubmissions || reviewedSubmissions.length === 0) {
        hasMore = false
        break
      }

      allReviewedSubmissions = [...allReviewedSubmissions, ...reviewedSubmissions]

      // If we got less than pageSize rows, we've reached the end
      if (reviewedSubmissions.length < pageSize) {
        hasMore = false
      } else {
        page++
      }
    }

    console.log('=== EXPORT DEBUGGING ===')
    console.log('Reviewed submissions found:', allReviewedSubmissions.length)

    if (allReviewedSubmissions.length === 0) {
      console.log('No reviewed submissions found')
      setTasks([])
      setLoading(false)
      return
    }

    const reviewedSubmissions = allReviewedSubmissions

    // Create a map of task_id to submission data (use the latest reviewed submission per task)
    const taskSubmissionMap = new Map()
    reviewedSubmissions?.forEach(sub => {
      const existingSub = taskSubmissionMap.get(sub.task_id)
      // Keep the submission with the most recent reviewed_at or updated_at timestamp
      if (!existingSub ||
          new Date(sub.reviewed_at || sub.updated_at) > new Date(existingSub.reviewed_at || existingSub.updated_at)) {
        taskSubmissionMap.set(sub.task_id, sub)
      }
    })

    const taskIds = Array.from(taskSubmissionMap.keys())
    console.log('Unique tasks with reviewed submissions:', taskIds.length)

    if (taskIds.length === 0) {
      setTasks([])
      setLoading(false)
      return
    }

    // Fetch tasks in batches to avoid URL length limits
    const BATCH_SIZE = 100
    let allTasks: Task[] = []

    for (let i = 0; i < taskIds.length; i += BATCH_SIZE) {
      const batch = taskIds.slice(i, i + BATCH_SIZE)
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .in('id', batch)

      if (error) {
        console.error('Error loading task batch:', error)
        continue
      }

      if (data) {
        allTasks = [...allTasks, ...(data as Task[])]
      }
    }

    // Sort by created_at descending
    const tasksData = allTasks.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    console.log('Tasks fetched:', tasksData?.length || 0)

    // Check grader status
    const tasksWithGraders = tasksData?.filter(task =>
      task.graders && Array.isArray(task.graders) && task.graders.length > 0
    ) || []

    const tasksWithoutGraders = tasksData?.filter(task =>
      !task.graders || !Array.isArray(task.graders) || task.graders.length === 0
    ) || []

    console.log('Tasks WITH graders:', tasksWithGraders.length)
    console.log('Tasks WITHOUT graders:', tasksWithoutGraders.length)

    if (tasksWithoutGraders.length > 0) {
      console.log('Sample tasks without graders:', tasksWithoutGraders.slice(0, 3).map(t => ({
        title: t.title,
        graders: t.graders
      })))
    }

    const finalTasks = tasksWithGraders.map(task => ({
      ...task,
      selected: false,
      submissionData: taskSubmissionMap.get(task.id)
    }))

    console.log('Final exportable tasks:', finalTasks.length)
    setTasks(finalTasks)

    // Load exporter emails for tasks that have been exported
    const exporterIds = [...new Set(tasksWithGraders
      .filter(t => t.last_exported_by)
      .map(t => t.last_exported_by!))]

    if (exporterIds.length > 0) {
      const { data: exporters } = await supabase
        .from('user_profiles')
        .select('id, email')
        .in('id', exporterIds)

      if (exporters) {
        const emailMap: Record<string, string> = {}
        exporters.forEach(e => {
          emailMap[e.id] = e.email
        })
        setExporterEmails(emailMap)
      }
    }

    setLoading(false)
  }

  const handleSelectTask = (taskId: string, checked: boolean) => {
    setTasks(tasks.map(task =>
      task.id === taskId ? { ...task, selected: checked } : task
    ))
  }

  const populateGraderExpectedValues = (graders: GraderConfig[], submissionData?: Submission): GraderConfig[] => {
    if (!submissionData || !submissionData.response_data) {
      console.warn('No submission data or response_data found')
      return graders
    }

    const responseData = submissionData.response_data
    console.log('Response data:', responseData)

    const formData = responseData.formData as Record<string, unknown> | undefined
    console.log('Form data:', formData)

    return graders.map(grader => {
      const populatedGrader = { ...grader }
      console.log('Processing grader:', grader.name, 'Type:', grader.type)

      // Populate expected values in structure fields from formData
      if (populatedGrader.config.structure && formData) {
        console.log('Structure fields found:', populatedGrader.config.structure.length)
        console.log('Available formData keys:', Object.keys(formData))
        console.log('Full formData:', JSON.stringify(formData, null, 2))

        populatedGrader.config.structure = populatedGrader.config.structure.map(field => {
          console.log(`\n--- Processing field "${field.id}" (name: "${field.name}") ---`)

          // Try multiple key variations to find the value
          const value = formData[field.id] ?? formData[field.name] ?? formData[field.id.toLowerCase()] ?? formData[field.name.toLowerCase()]

          console.log(`Raw value found:`, value, 'Type:', typeof value)

          // Convert value based on field type
          let expected: string | number | boolean | undefined = undefined

          if (value !== undefined && value !== null && value !== '') {
            switch (field.type) {
              case 'int':
                expected = typeof value === 'number' ? value : parseInt(String(value), 10)
                if (isNaN(expected as number)) expected = undefined
                break
              case 'float':
                expected = typeof value === 'number' ? value : parseFloat(String(value))
                if (isNaN(expected as number)) expected = undefined
                break
              case 'boolean':
                expected = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true'
                break
              case 'string':
              default:
                expected = String(value)
                break
            }
          }

          console.log(`Final expected value:`, expected, 'Type:', typeof expected)

          return {
            ...field,
            comparator: {
              ...field.comparator,
              config: {
                ...field.comparator.config,
                expected
              }
            }
          }
        })
      }

      // Populate expected values in test_cases from formData
      if (populatedGrader.config.test_cases && formData) {
        console.log('Test cases found:', populatedGrader.config.test_cases.length)
        populatedGrader.config.test_cases = populatedGrader.config.test_cases.map(testCase => {
          console.log(`\n--- Processing test case "${testCase.id}" ---`)

          // Try multiple key variations
          const rawValue = formData[testCase.id] ?? formData[testCase.id.toLowerCase()]

          console.log(`Raw value for "${testCase.id}":`, rawValue, 'Type:', typeof rawValue)

          // Try to parse as number if it looks like a number
          let expected_value: string | number | boolean | undefined = undefined

          if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
            const strValue = String(rawValue)

            // Check if it's a valid number
            if (!isNaN(Number(strValue)) && strValue.trim() !== '') {
              const numValue = Number(strValue)
              // Use the numeric value if it's a valid number
              expected_value = numValue
            } else if (strValue.toLowerCase() === 'true' || strValue.toLowerCase() === 'false') {
              // Parse as boolean
              expected_value = strValue.toLowerCase() === 'true'
            } else {
              // Keep as string
              expected_value = strValue
            }
          }

          console.log(`Final expected_value for "${testCase.id}":`, expected_value, 'Type:', typeof expected_value)

          return {
            ...testCase,
            expected_value
          }
        })
      }

      return populatedGrader
    })
  }

  const generateExport = async () => {
    const selectedTasks = tasks.filter(task => task.selected)

    if (selectedTasks.length === 0) {
      alert('Please select at least one task to export')
      return
    }

    console.log('=== EXPORT GENERATION START ===')
    console.log('Selected tasks count:', selectedTasks.length)

    selectedTasks.forEach((task, index) => {
      console.log(`\n--- Task ${index + 1}: ${task.title} ---`)
      console.log('Has submissionData?', !!task.submissionData)
      console.log('Submission data:', task.submissionData)
      if (task.submissionData) {
        console.log('Response data:', task.submissionData.response_data)
      }
      console.log('Task graders:', task.graders)
    })

    const exportData = {
      tasks: selectedTasks.map(task => ({
        name: task.title,
        description: task.description || '',
        prompt: task.prompt || '',
        graders: task.graders ? populateGraderExpectedValues(task.graders, task.submissionData) : []
      }))
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    setExportJson(jsonString)
    setShowEditor(true)
    setExportMarked(false)

    // Store the task IDs for tracking when admin marks as exported
    setCurrentExportTaskIds(selectedTasks.map(t => t.id))
  }

  const handleMarkAsExported = async () => {
    if (currentExportTaskIds.length === 0) return

    setMarkingExported(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const now = new Date().toISOString()

        // Update each task's export tracking fields in database
        for (const taskId of currentExportTaskIds) {
          const task = tasks.find(t => t.id === taskId)
          const currentCount = task?.export_count || 0

          await supabase
            .from('tasks')
            .update({
              last_exported_at: now,
              last_exported_by: user.id,
              export_count: currentCount + 1
            })
            .eq('id', taskId)
        }

        // Update local state immediately to show export badges
        setTasks(tasks.map(task => {
          if (currentExportTaskIds.includes(task.id)) {
            return {
              ...task,
              last_exported_at: now,
              last_exported_by: user.id,
              export_count: (task.export_count || 0) + 1
            }
          }
          return task
        }))

        // Add admin email to exporter emails map
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('id', user.id)
          .single()

        if (profile) {
          setExporterEmails({
            ...exporterEmails,
            [user.id]: profile.email
          })
        }

        setExportMarked(true)
        setTimeout(() => setExportMarked(false), 3000)
      }
    } catch (error) {
      console.error('Error tracking export:', error)
      alert('Failed to mark tasks as exported: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setMarkingExported(false)
    }
  }

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      alert('Failed to copy to clipboard')
    }
  }

  const handleDownloadJson = () => {
    const blob = new Blob([exportJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tasks-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const selectedCount = tasks.filter(task => task.selected).length

  // Filter tasks based on feedback comments, search query, and export status
  const filteredTasks = tasks.filter(task => {
    // Comment filter
    if (filter !== 'all') {
      const hasFeedback = task.submissionData?.feedback && task.submissionData.feedback.trim().length > 0
      if (filter === 'with_comments' && !hasFeedback) return false
      if (filter === 'without_comments' && hasFeedback) return false
    }

    // Search filter (search in title and description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const matchesTitle = task.title.toLowerCase().includes(query)
      const matchesDescription = task.description?.toLowerCase().includes(query)
      if (!matchesTitle && !matchesDescription) return false
    }

    // Export status filter
    if (exportStatusFilter !== 'all') {
      const isExported = !!task.last_exported_at
      if (exportStatusFilter === 'exported' && !isExported) return false
      if (exportStatusFilter === 'not_exported' && isExported) return false
    }

    return true
  })

  const stats = {
    all: tasks.length,
    withComments: tasks.filter(t => t.submissionData?.feedback && t.submissionData.feedback.trim().length > 0).length,
    withoutComments: tasks.filter(t => !t.submissionData?.feedback || t.submissionData.feedback.trim().length === 0).length,
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Export Tasks</h2>
          <p className="text-sm text-gray-600 mt-1">
            Export reviewed tasks as JSON templates with labeler values as expected answers
          </p>
        </div>
      </div>

      {!showEditor ? (
        <>
          {/* Search and Filters */}
          <div className="mb-4 space-y-3">
            {/* Search Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by task name or description..."
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Export Status Filter */}
              <select
                value={exportStatusFilter}
                onChange={(e) => setExportStatusFilter(e.target.value as 'all' | 'exported' | 'not_exported')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                <option value="all">All Export Status</option>
                <option value="exported">Exported</option>
                <option value="not_exported">Not Exported</option>
              </select>
            </div>

            {/* Comment Filter Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded ${
                  filter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                All ({stats.all})
              </button>
              <button
                onClick={() => setFilter('without_comments')}
                className={`px-4 py-2 rounded ${
                  filter === 'without_comments' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                No Comments ({stats.withoutComments})
              </button>
              <button
                onClick={() => setFilter('with_comments')}
                className={`px-4 py-2 rounded ${
                  filter === 'with_comments' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                With Comments ({stats.withComments})
              </button>
            </div>
          </div>

          {/* Selection Controls */}
          <div className="mb-4 flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filteredTasks.length > 0 && filteredTasks.every(task => task.selected)}
                  onChange={() => {
                    // Determine if we should select or deselect
                    const allFilteredSelected = filteredTasks.every(task => task.selected)
                    const shouldSelect = !allFilteredSelected

                    // Get IDs of filtered tasks for efficient lookup
                    const filteredTaskIds = new Set(filteredTasks.map(t => t.id))

                    // Select/deselect only filtered tasks
                    setTasks(tasks.map(task =>
                      filteredTaskIds.has(task.id)
                        ? { ...task, selected: shouldSelect }
                        : task
                    ))
                  }}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Select All Visible</span>
              </label>
              <span className="text-sm text-gray-600">
                {filteredTasks.filter(t => t.selected).length} of {filteredTasks.length} selected
              </span>
            </div>
            <button
              onClick={generateExport}
              disabled={selectedCount === 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Export
            </button>
          </div>

          {/* Tasks List */}
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="mt-2 text-gray-600">Loading tasks...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-2 text-gray-600">
                {filter === 'all' ? 'No reviewed tasks with graders found' : `No tasks ${filter === 'with_comments' ? 'with' : 'without'} comments`}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {filter === 'all'
                  ? 'Tasks must have graders configured and at least one reviewed or completed submission'
                  : 'Try selecting a different filter'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={`bg-white border-2 rounded-lg p-4 transition-all ${
                    task.selected
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={task.selected}
                      onChange={(e) => handleSelectTask(task.id, e.target.checked)}
                      className="mt-1 w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
                      {task.description && (
                        <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-4 text-sm flex-wrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          task.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : task.status === 'reviewed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {task.status.toUpperCase()}
                        </span>
                        {task.submissionData?.feedback && task.submissionData.feedback.trim().length > 0 ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800">
                            HAS COMMENTS
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                            NO COMMENTS
                          </span>
                        )}
                        {task.last_exported_at && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
                            📤 Exported {task.export_count || 1}x
                          </span>
                        )}
                        <span className="text-gray-500">
                          {task.graders?.length || 0} grader{task.graders?.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-gray-500">
                          Created: {new Date(task.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {task.last_exported_at && (
                        <div className="mt-2 text-xs text-gray-500 italic">
                          Last exported {new Date(task.last_exported_at).toLocaleString()}
                          {task.last_exported_by && exporterEmails[task.last_exported_by] && (
                            <> by {exporterEmails[task.last_exported_by]}</>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* JSON Editor View */
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Export Preview</p>
                <p className="text-xs text-blue-800 mt-1">
                  Review and edit the JSON below. Grader expected values have been populated from the reviewed labeler submission.
                  When you&apos;re satisfied, click &quot;Mark as Exported&quot; to record this export.
                </p>
              </div>
            </div>
          </div>

          {/* Mark as Exported Button */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-purple-900">Ready to mark as exported?</h3>
                <p className="text-xs text-purple-700 mt-1">
                  Click the button to record that you&apos;ve exported these {currentExportTaskIds.length} task{currentExportTaskIds.length !== 1 ? 's' : ''}.
                  This will track the export timestamp and count.
                </p>
              </div>
              <button
                onClick={handleMarkAsExported}
                disabled={markingExported || exportMarked}
                className={`ml-4 px-6 py-3 rounded-lg font-semibold transition-all ${
                  exportMarked
                    ? 'bg-green-100 text-green-800 border-2 border-green-400'
                    : 'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {markingExported ? (
                  <>
                    <svg className="inline-block animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Marking...
                  </>
                ) : exportMarked ? (
                  <>
                    <svg className="inline-block -ml-1 mr-2 h-5 w-5 text-green-800" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Marked as Exported!
                  </>
                ) : (
                  '✓ Mark as Exported'
                )}
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-300 px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">JSON Export</span>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyToClipboard}
                  className="px-3 py-1 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadJson}
                  className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
            <textarea
              value={exportJson}
              onChange={(e) => setExportJson(e.target.value)}
              className="w-full h-96 p-4 font-mono text-sm text-gray-800 focus:outline-none resize-none"
              spellCheck={false}
            />
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={async () => {
                setShowEditor(false)
                setExportJson('')
                setCurrentExportTaskIds([])
                // Reload tasks to show updated export tracking
                await loadCompletedTasks()
              }}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              ← Back to Selection
            </button>
            <div className="text-sm text-gray-600">
              {selectedCount} task{selectedCount !== 1 ? 's' : ''} exported
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
