-- Add grader-based fields to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS prompt TEXT,
ADD COLUMN IF NOT EXISTS graders JSONB;

-- Add grader-based fields to submissions table
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS response_data JSONB,
ADD COLUMN IF NOT EXISTS grader_results JSONB,
ADD COLUMN IF NOT EXISTS score NUMERIC;

-- Create index for faster JSON queries
CREATE INDEX IF NOT EXISTS idx_tasks_graders ON public.tasks USING GIN (graders);
CREATE INDEX IF NOT EXISTS idx_submissions_response_data ON public.submissions USING GIN (response_data);
CREATE INDEX IF NOT EXISTS idx_submissions_grader_results ON public.submissions USING GIN (grader_results);

-- Comment on new columns
COMMENT ON COLUMN public.tasks.prompt IS 'The prompt/question shown to labelers';
COMMENT ON COLUMN public.tasks.graders IS 'Array of grader configurations for auto-grading';
COMMENT ON COLUMN public.submissions.response_data IS 'Labeler response in structured format';
COMMENT ON COLUMN public.submissions.grader_results IS 'Results from running graders';
COMMENT ON COLUMN public.submissions.score IS 'Calculated score from graders';
