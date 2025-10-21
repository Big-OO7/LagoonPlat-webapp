-- Add awaiting_tasks field to user_profiles
-- This allows labelers to indicate they're ready for new task assignments

ALTER TABLE public.user_profiles
ADD COLUMN awaiting_tasks BOOLEAN DEFAULT FALSE;

-- Create index for efficient querying of labelers awaiting tasks
CREATE INDEX idx_user_profiles_awaiting_tasks ON public.user_profiles(awaiting_tasks) WHERE awaiting_tasks = TRUE;

-- Add RLS policy to allow users to update their own awaiting_tasks status
CREATE POLICY "Users can update their own awaiting_tasks status"
    ON public.user_profiles
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
