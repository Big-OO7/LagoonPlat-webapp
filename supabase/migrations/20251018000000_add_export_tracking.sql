-- Add export tracking fields to tasks table
-- Run this in your Supabase SQL editor

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS last_exported_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_exported_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS export_count INTEGER DEFAULT 0;

-- Create index for faster queries on export tracking
CREATE INDEX IF NOT EXISTS idx_tasks_last_exported_at ON tasks(last_exported_at);
CREATE INDEX IF NOT EXISTS idx_tasks_last_exported_by ON tasks(last_exported_by);

-- Add comment to document the fields
COMMENT ON COLUMN tasks.last_exported_at IS 'Timestamp of the most recent export of this task';
COMMENT ON COLUMN tasks.last_exported_by IS 'User ID of the admin who last exported this task';
COMMENT ON COLUMN tasks.export_count IS 'Number of times this task has been exported';
