-- Migration: Add reviewer features and accuracy tracking
-- 1. Allow reviewers to create custom "best answer" submissions
-- 2. Track first submission attempts for accuracy calculation
-- 3. Add index for flagged_unsolvable submissions

-- Add is_first_submission flag to submissions table
-- This tracks whether this was the labeler's first attempt (true) or a resubmission after revision (false)
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS is_first_submission BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.submissions.is_first_submission IS 'True if this is the first submission attempt, false if resubmitted after revision request';

-- Add is_reviewer_created flag to submissions table
-- This allows reviewers to create custom "best answer" submissions
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS is_reviewer_created BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.submissions.is_reviewer_created IS 'True if this submission was created by a reviewer as a custom best answer';

-- Add created_by column to track who created the submission (labeler or reviewer)
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.submissions.created_by IS 'User ID of who created this submission (labeler for normal submissions, reviewer for custom answers)';

-- Backfill created_by with labeler_id for existing submissions
UPDATE public.submissions
SET created_by = labeler_id
WHERE created_by IS NULL AND is_reviewer_created = false;

-- Create index for unsolvable/flagged submissions for the new queue
CREATE INDEX IF NOT EXISTS idx_submissions_flagged_unsolvable
ON public.submissions(flagged_unsolvable, task_id)
WHERE flagged_unsolvable = true;

-- Create index for first submissions (for accuracy calculations)
CREATE INDEX IF NOT EXISTS idx_submissions_first_submission
ON public.submissions(labeler_id, is_first_submission, status)
WHERE is_first_submission = true;

-- Update RLS policy to allow reviewers to create submissions
-- This enables the "write custom answer" feature
CREATE POLICY "Admins can create reviewer submissions"
ON public.submissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND (role = 'admin' OR role = 'super_admin')
  )
  AND is_reviewer_created = true
);

-- Function to handle resubmissions after revision requests
-- When a labeler resubmits after revision, mark it as not first submission
CREATE OR REPLACE FUNCTION public.handle_resubmission()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is an UPDATE from revision_requested to submitted
  -- and there was already a first submission, mark this as not first
  IF (TG_OP = 'UPDATE'
      AND OLD.status = 'revision_requested'
      AND NEW.status = 'submitted'
      AND NEW.submitted_at IS NOT NULL) THEN

    -- Check if there's already a first submission for this task by this labeler
    IF EXISTS (
      SELECT 1 FROM public.submissions
      WHERE task_id = NEW.task_id
        AND labeler_id = NEW.labeler_id
        AND id != NEW.id
        AND is_first_submission = true
    ) THEN
      -- This is a resubmission, not the first attempt
      NEW.is_first_submission := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for resubmission handling
DROP TRIGGER IF EXISTS trigger_handle_resubmission ON public.submissions;
CREATE TRIGGER trigger_handle_resubmission
  BEFORE UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_resubmission();

-- Backfill is_first_submission for existing data
-- Mark resubmissions (where status was revision_requested then resubmitted)
WITH first_submissions AS (
  SELECT DISTINCT ON (task_id, labeler_id)
    id,
    task_id,
    labeler_id,
    submitted_at
  FROM public.submissions
  WHERE submitted_at IS NOT NULL
    AND is_reviewer_created = false
  ORDER BY task_id, labeler_id, submitted_at ASC
)
UPDATE public.submissions s
SET is_first_submission = CASE
  WHEN fs.id IS NOT NULL THEN true
  ELSE false
END
FROM first_submissions fs
WHERE s.id = fs.id
  OR (s.task_id = fs.task_id
      AND s.labeler_id = fs.labeler_id
      AND s.submitted_at > fs.submitted_at);
