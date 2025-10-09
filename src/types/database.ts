export type TaskStatus = 'draft' | 'assigned' | 'in_progress' | 'submitted' | 'reviewed' | 'completed'

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
  status: TaskStatus
  deadline: string | null
  created_by: string
  created_at: string
  updated_at: string
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
  rubric_data: Record<string, unknown> // Filled rubric data
  status: TaskStatus
  feedback: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
  updated_at: string
}

export interface TaskWithDetails extends Task {
  artifacts?: Artifact[]
  rubric?: Rubric
  assignments?: TaskAssignment[]
  submissions?: Submission[]
}
