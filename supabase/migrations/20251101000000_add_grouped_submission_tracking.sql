-- Migration: Add grouped submission tracking for tasks
-- This allows tasks to only appear in review queue when all required submissions are complete

-- Add required_submissions column to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS required_submissions INTEGER DEFAULT 3;

-- Add comment explaining the column
COMMENT ON COLUMN public.tasks.required_submissions IS 'Number of submissions required before task appears in review queue';

-- Create a function to count submitted submissions for a task
CREATE OR REPLACE FUNCTION public.count_task_submissions(task_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.submissions
  WHERE task_id = task_uuid
    AND submitted_at IS NOT NULL
$$ LANGUAGE sql STABLE;

-- Create a function to check if a task is ready for review
CREATE OR REPLACE FUNCTION public.is_task_ready_for_review(task_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT (
    SELECT COUNT(*)
    FROM public.submissions
    WHERE task_id = task_uuid
      AND submitted_at IS NOT NULL
  ) >= (
    SELECT COALESCE(required_submissions, 3)
    FROM public.tasks
    WHERE id = task_uuid
  )
$$ LANGUAGE sql STABLE;

-- Create an index to optimize submission counting queries
CREATE INDEX IF NOT EXISTS idx_submissions_task_submitted
ON public.submissions(task_id, submitted_at)
WHERE submitted_at IS NOT NULL;

-- Add a trigger to automatically update task status when submissions reach the threshold
CREATE OR REPLACE FUNCTION public.update_task_status_on_submission()
RETURNS TRIGGER AS $$
DECLARE
  submission_count INTEGER;
  required_count INTEGER;
BEGIN
  -- Only proceed if this is a new submission or submission status changed
  IF (TG_OP = 'INSERT' AND NEW.submitted_at IS NOT NULL) OR
     (TG_OP = 'UPDATE' AND OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL) THEN

    -- Get the required submission count for this task
    SELECT required_submissions INTO required_count
    FROM public.tasks
    WHERE id = NEW.task_id;

    -- Count total submitted submissions for this task
    SELECT COUNT(*) INTO submission_count
    FROM public.submissions
    WHERE task_id = NEW.task_id
      AND submitted_at IS NOT NULL;

    -- If we've reached the required count, update task status to 'submitted'
    IF submission_count >= required_count THEN
      UPDATE public.tasks
      SET status = 'submitted',
          updated_at = NOW()
      WHERE id = NEW.task_id
        AND status != 'submitted';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_task_status_on_submission ON public.submissions;
CREATE TRIGGER trigger_update_task_status_on_submission
  AFTER INSERT OR UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_status_on_submission();

-- Update existing tasks to set required_submissions based on current assignments
UPDATE public.tasks t
SET required_submissions = (
  SELECT COUNT(*)
  FROM public.task_assignments ta
  WHERE ta.task_id = t.id
)
WHERE id IN (
  SELECT DISTINCT task_id
  FROM public.task_assignments
);

-- Set default to 3 for tasks with no assignments yet
UPDATE public.tasks
SET required_submissions = 3
WHERE required_submissions IS NULL OR required_submissions = 0;
