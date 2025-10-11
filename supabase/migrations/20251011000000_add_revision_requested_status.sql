-- Add 'revision_requested' to task_status enum
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'revision_requested';

-- Add comment for documentation
COMMENT ON TYPE task_status IS 'Task status: draft, assigned, in_progress, submitted, reviewed, completed, revision_requested';
