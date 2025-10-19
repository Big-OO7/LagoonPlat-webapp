export type TaskStatus = 'draft' | 'assigned' | 'in_progress' | 'submitted' | 'reviewed' | 'completed' | 'revision_requested'

// New grader-based types
export type GraderType = 'xml' | 'json' | 'text' | 'number' | 'unit' | 'unit_test'
export type ComparatorType = 'equals' | 'contains' | 'range' | 'regex'

export interface ComparatorConfig {
  type: ComparatorType
  config: {
    expected?: string | number | boolean
    min?: number
    max?: number
    pattern?: string
    [key: string]: unknown
  }
}

export interface GraderStructureField {
  id: string
  name: string
  type: 'int' | 'string' | 'boolean' | 'float'
  weight: number
  comparator: ComparatorConfig
}

export interface GraderConfig {
  type: GraderType
  name: string
  config: {
    structure?: GraderStructureField[]
    test_cases?: Array<{ id: string; expected_value?: unknown }>
    [key: string]: unknown
  }
  weight: number
}

export interface TaskDefinition {
  name: string
  description?: string
  prompt: string
  graders: GraderConfig[]
}

export interface BulkTaskUpload {
  tasks: TaskDefinition[]
}

// Legacy rubric types (keeping for backward compatibility during migration)
export type RubricFieldType = 'text' | 'number' | 'select' | 'multiselect' | 'textarea' | 'rating' | 'boolean'

export interface RubricField {
  id: string
  label: string
  type: RubricFieldType
  required?: boolean
  options?: string[] // For select/multiselect
  min?: number // For number/rating
  max?: number // For number/rating
  placeholder?: string
  helpText?: string
}

export interface RubricSchema {
  fields: RubricField[]
}

export interface Task {
  id: string
  title: string
  description: string | null
  prompt: string | null
  graders: GraderConfig[] | null
  status: TaskStatus
  deadline: string | null
  created_by: string
  created_at: string
  updated_at: string
  last_exported_at: string | null
  last_exported_by: string | null
  export_count: number | null
}

export interface Artifact {
  id: string
  task_id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  uploaded_by: string
  created_at: string
}

export interface Rubric {
  id: string
  task_id: string
  name: string
  description: string | null
  schema: RubricSchema
  created_at: string
  updated_at: string
}

export interface TaskAssignment {
  id: string
  task_id: string
  labeler_id: string
  assigned_by: string
  assigned_at: string
}

export interface Submission {
  id: string
  task_id: string
  labeler_id: string
  response_data: Record<string, unknown> // Labeler's response
  rubric_data: Record<string, unknown> | null // Legacy support
  grader_results: Record<string, unknown> | null // Auto-grading results
  score: number | null // Calculated score
  status: TaskStatus
  feedback: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
  updated_at: string
  labeler_comment: string | null // Labeler's comments about task issues
  flagged_unsolvable: boolean // Flag for unsolvable/problematic tasks
}

export interface TaskWithDetails extends Task {
  artifacts?: Artifact[]
  rubric?: Rubric
  assignments?: TaskAssignment[]
  submissions?: Submission[]
}
