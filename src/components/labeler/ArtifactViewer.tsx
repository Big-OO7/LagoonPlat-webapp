'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Artifact } from '@/types/database'

interface ArtifactViewerProps {
  artifacts: Artifact[]
}

export default function ArtifactViewer({ artifacts }: ArtifactViewerProps) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const supabase = createClient()

  const downloadArtifact = async (artifact: Artifact) => {
    setDownloading(artifact.id)

    try {
      const { data, error } = await supabase.storage
        .from('artifacts')
        .download(artifact.storage_path)

      if (error) throw error

      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = artifact.file_name
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Error downloading artifact:', error)
      alert('Failed to download file')
    } finally {
      setDownloading(null)
    }
  }

  const getFileIcon = (fileType: string) => {
    if (fileType === 'pdf') {
      return (
        <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 18h12V6h-4V2H4v16zm-2 1V0h10l6 6v14H2v-1z" />
        </svg>
      )
    } else if (['xlsx', 'xls', 'csv'].includes(fileType)) {
      return (
        <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 2h12l4 4v12H0V2h4zm0 2v12h12V6h-4V4H4z" />
        </svg>
      )
    }
    return (
      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  }

  if (artifacts.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <p className="text-gray-600">No artifacts attached to this task</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Download and review the following files to complete this task:
      </p>

      {artifacts.map((artifact) => (
        <div
          key={artifact.id}
          className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              {getFileIcon(artifact.file_type)}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">
                {artifact.file_name}
              </h3>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                <span className="uppercase font-medium">{artifact.file_type}</span>
                <span>•</span>
                <span>{(artifact.file_size / 1024).toFixed(2)} KB</span>
                <span>•</span>
                <span>Uploaded {new Date(artifact.created_at).toLocaleDateString()}</span>
              </div>
            </div>

            <button
              onClick={() => downloadArtifact(artifact)}
              disabled={downloading === artifact.id}
              className="flex-shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading === artifact.id ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Downloading...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </span>
              )}
            </button>
          </div>
        </div>
      ))}

      <div className="p-4 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-900">
          <strong>Tip:</strong> Review all artifacts carefully before filling out the rubric form.
          You can switch between the Rubric and Artifacts tabs at any time.
        </p>
      </div>
    </div>
  )
}
