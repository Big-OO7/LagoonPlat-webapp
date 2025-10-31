-- Add best_submission_id column to tasks table
ALTER TABLE public.tasks
ADD COLUMN best_submission_id UUID REFERENCES public.submissions(id) ON DELETE SET NULL;

-- Add index for better performance when querying best submissions
CREATE INDEX idx_tasks_best_submission_id ON public.tasks(best_submission_id);

-- Add comment to explain the purpose
COMMENT ON COLUMN public.tasks.best_submission_id IS 'References the submission selected as the best when multiple labelers work on the same task';
