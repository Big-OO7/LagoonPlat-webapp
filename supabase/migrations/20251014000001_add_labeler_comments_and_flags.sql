-- Add labeler comment and unsolvable flag fields to submissions table
-- Allows labelers to report issues with tasks

ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS labeler_comment TEXT,
ADD COLUMN IF NOT EXISTS flagged_unsolvable BOOLEAN DEFAULT FALSE;

-- Create index for finding flagged submissions
CREATE INDEX IF NOT EXISTS idx_submissions_flagged ON public.submissions(flagged_unsolvable) WHERE flagged_unsolvable = TRUE;

-- Add comments for documentation
COMMENT ON COLUMN public.submissions.labeler_comment IS 'Labeler comments about task issues or clarifications needed';
COMMENT ON COLUMN public.submissions.flagged_unsolvable IS 'Flag indicating labeler believes task is unsolvable or has issues';
