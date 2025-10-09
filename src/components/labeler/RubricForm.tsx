'use client'

import type { Rubric, RubricField } from '@/types/database'

interface RubricFormProps {
  rubric: Rubric
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
  readOnly?: boolean
}

export default function RubricForm({ rubric, data, onChange, readOnly = false }: RubricFormProps) {
  const handleFieldChange = (fieldId: string, value: unknown) => {
    onChange({ ...data, [fieldId]: value })
  }

  const renderField = (field: RubricField) => {
    const value = data[field.id]

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
          />
        )

      case 'textarea':
        return (
          <textarea
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
          />
        )

      case 'number':
        return (
          <input
            type="number"
            value={(value as number) || ''}
            onChange={(e) => handleFieldChange(field.id, parseFloat(e.target.value))}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
          />
        )

      case 'rating':
        const rating = (value as number) || 0
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => !readOnly && handleFieldChange(field.id, num)}
                disabled={readOnly}
                className={`w-10 h-10 rounded ${
                  num <= rating
                    ? 'bg-yellow-400 text-white'
                    : 'bg-gray-200 text-gray-600'
                } hover:bg-yellow-300 disabled:hover:bg-gray-200 disabled:cursor-not-allowed`}
              >
                {num}
              </button>
            ))}
            <span className="ml-2 text-gray-600 flex items-center">
              {rating > 0 ? `${rating}/5` : 'Not rated'}
            </span>
          </div>
        )

      case 'select':
        return (
          <select
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            disabled={readOnly}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
          >
            <option value="">Select an option...</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )

      case 'multiselect':
        const selectedValues = (value as string[]) || []
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option)}
                  onChange={(e) => {
                    if (readOnly) return
                    const newValues = e.target.checked
                      ? [...selectedValues, option]
                      : selectedValues.filter((v) => v !== option)
                    handleFieldChange(field.id, newValues)
                  }}
                  disabled={readOnly}
                  className="w-4 h-4 text-green-600 rounded disabled:cursor-not-allowed"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        )

      case 'boolean':
        return (
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={field.id}
                checked={value === true}
                onChange={() => !readOnly && handleFieldChange(field.id, true)}
                disabled={readOnly}
                className="w-4 h-4 text-green-600 disabled:cursor-not-allowed"
              />
              <span className="text-gray-700">Yes</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={field.id}
                checked={value === false}
                onChange={() => !readOnly && handleFieldChange(field.id, false)}
                disabled={readOnly}
                className="w-4 h-4 text-green-600 disabled:cursor-not-allowed"
              />
              <span className="text-gray-700">No</span>
            </label>
          </div>
        )

      default:
        return <p className="text-gray-500">Unsupported field type: {field.type}</p>
    }
  }

  return (
    <div className="space-y-6">
      {rubric.description && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-900">{rubric.description}</p>
        </div>
      )}

      {rubric.schema.fields.map((field, index) => (
        <div key={field.id} className="border border-gray-200 rounded-lg p-4">
          <label className="block mb-3">
            <span className="text-gray-900 font-medium">
              {index + 1}. {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </span>
            {field.helpText && (
              <p className="text-sm text-gray-500 mt-1">{field.helpText}</p>
            )}
          </label>
          {renderField(field)}
        </div>
      ))}

      {readOnly && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center">
          <p className="text-gray-600">This form is read-only</p>
        </div>
      )}
    </div>
  )
}
