'use client'

import type { GraderConfig } from '@/types/database'

interface FillInTheBlankFormProps {
  graders: GraderConfig[]
  formResponses: Record<string, string>
  onChange: (responses: Record<string, string>) => void
  disabled?: boolean
}

export default function FillInTheBlankForm({
  graders,
  formResponses,
  onChange,
  disabled = false
}: FillInTheBlankFormProps) {
  const handleFieldChange = (fieldName: string, value: string) => {
    onChange({
      ...formResponses,
      [fieldName]: value
    })
  }

  return (
    <div className="space-y-6">
      {graders.map((grader, graderIndex) => (
        grader.config.structure && grader.config.structure.length > 0 && (
          <div key={graderIndex} className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-6">
            {/* Grader Header */}
            <div className="mb-4 pb-3 border-b border-green-400">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-green-900 text-base">
                  {grader.name}
                </h3>
                <span className="text-xs text-green-700 bg-green-200 px-2 py-1 rounded font-mono">
                  {grader.type.toUpperCase()}
                </span>
              </div>
            </div>

            {/* XML Fill-in-the-blank format */}
            <div className="bg-white rounded-lg p-4 border border-gray-300 font-mono text-sm space-y-3">
              {grader.config.structure.map((field, fieldIndex) => {
                const fieldValue = formResponses[field.name] || ''
                const isNumber = field.type === 'int' || field.type === 'float'

                return (
                  <div key={fieldIndex} className="flex items-start gap-2">
                    {/* Opening XML tag */}
                    <span className="text-blue-600 select-none flex-shrink-0 mt-2">
                      &lt;{field.name}&gt;
                    </span>

                    {/* Input field */}
                    <div className="flex-1">
                      <input
                        type={isNumber ? 'number' : 'text'}
                        value={fieldValue}
                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                        disabled={disabled}
                        step={field.type === 'float' ? 'any' : undefined}
                        placeholder={`Enter ${field.type}...`}
                        className="w-full px-3 py-2 border-b-2 border-green-400 bg-yellow-50 focus:bg-white focus:border-green-600 rounded text-gray-900 font-sans focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
                      />

                      {/* Field metadata */}
                      <div className="mt-1 flex items-center gap-3 text-xs font-sans">
                        <span className="text-gray-600">
                          Type: <span className="font-semibold text-gray-800">{field.type}</span>
                        </span>
                        <span className="text-gray-600">
                          Weight: <span className="font-semibold text-indigo-600">{field.weight}</span>
                        </span>
                        {field.comparator.config.expected !== undefined && (
                          <span className="text-blue-600">
                            Expected: <span className="font-semibold font-mono">{String(field.comparator.config.expected)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Closing XML tag */}
                    <span className="text-blue-600 select-none flex-shrink-0 mt-2">
                      &lt;/{field.name}&gt;
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Helper text */}
            <div className="mt-3 text-xs text-green-800 bg-green-100 p-2 rounded">
              <strong>💡 Tip:</strong> Fill in each field between the XML tags. Your response will be auto-formatted and graded.
            </div>
          </div>
        )
      ))}
    </div>
  )
}
