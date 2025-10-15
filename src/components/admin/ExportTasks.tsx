'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, GraderConfig } from '@/types/database'

interface TaskWithSelection extends Task {
  selected: boolean
}

export default function ExportTasks() {
  const [tasks, setTasks] = useState<TaskWithSelection[]>([])
  const [loading, setLoading] = useState(true)
  const [exportJson, setExportJson] = useState('')
  const [showEditor, setShowEditor] = useState(false)
  const [copied, setCopied] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadCompletedTasks()
  }, [])

  const loadCompletedTasks = async () => {
    setLoading(true)

    // Fetch tasks that have been reviewed or completed
    const { data: tasksData, error } = await supabase
      .from('tasks')
      .select('*')
      .in('status', ['reviewed', 'completed', 'submitted'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading tasks:', error)
      setLoading(false)
      return
    }

    // Filter tasks that have graders
    const tasksWithGraders = tasksData?.filter(task =>
      task.graders && Array.isArray(task.graders) && task.graders.length > 0
    ) || []

    setTasks(tasksWithGraders.map(task => ({ ...task, selected: false })))
    setLoading(false)
  }

  const handleSelectAll = (checked: boolean) => {
    setTasks(tasks.map(task => ({ ...task, selected: checked })))
  }

  const handleSelectTask = (taskId: string, checked: boolean) => {
    setTasks(tasks.map(task =>
      task.id === taskId ? { ...task, selected: checked } : task
    ))
  }

  const clearGraderExpectedValues = (graders: GraderConfig[]): GraderConfig[] => {
    return graders.map(grader => {
      const clearedGrader = { ...grader }

      // Clear expected values in structure fields
      if (clearedGrader.config.structure) {
        clearedGrader.config.structure = clearedGrader.config.structure.map(field => ({
          ...field,
          comparator: {
            ...field.comparator,
            config: {
              ...field.comparator.config,
              expected: null // Clear the expected value
            }
          }
        }))
      }

      // Clear expected values in test_cases
      if (clearedGrader.config.test_cases) {
        clearedGrader.config.test_cases = clearedGrader.config.test_cases.map(testCase => ({
          ...testCase,
          expected_value: null // Clear the expected value
        }))
      }

      return clearedGrader
    })
  }

  const generateExport = () => {
    const selectedTasks = tasks.filter(task => task.selected)

    if (selectedTasks.length === 0) {
      alert('Please select at least one task to export')
      return
    }

    const exportData = {
      tasks: selectedTasks.map(task => ({
        name: task.title,
        description: task.description || '',
        prompt: task.prompt || '',
        graders: task.graders ? clearGraderExpectedValues(task.graders) : []
      }))
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    setExportJson(jsonString)
    setShowEditor(true)
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Export Tasks</h2>
          <p className="text-sm text-gray-600 mt-1">
            Export completed tasks as JSON templates with blank grader values
          </p>
        </div>
      </div>

      {!showEditor ? (
        <>
          {/* Selection Controls */}
          <div className="mb-4 flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tasks.length > 0 && tasks.every(task => task.selected)}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">Select All</span>
              </label>
              <span className="text-sm text-gray-600">
                {selectedCount} of {tasks.length} selected
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
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="mt-2 text-gray-600">No completed tasks with graders found</p>
              <p className="text-sm text-gray-500 mt-1">
                Tasks must have graders configured and be submitted/reviewed/completed
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
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
                      <div className="mt-2 flex items-center gap-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          task.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : task.status === 'reviewed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {task.status.toUpperCase()}
                        </span>
                        <span className="text-gray-500">
                          {task.graders?.length || 0} grader{task.graders?.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-gray-500">
                          Created: {new Date(task.created_at).toLocaleDateString()}
                        </span>
                      </div>
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Export Preview</p>
                <p className="text-xs text-blue-800 mt-1">
                  Review and edit the JSON below. All grader expected values have been cleared for template use.
                </p>
              </div>
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
              onClick={() => {
                setShowEditor(false)
                setExportJson('')
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
