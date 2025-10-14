-- Fix RLS policy for labelers updating submissions
-- The previous policy only allowed updates when status was 'submitted',
-- which prevented labelers from changing status from 'in_progress' to 'submitted'

DROP POLICY IF EXISTS "Labelers can update their own submissions (before review)" ON public.submissions;

CREATE POLICY "Labelers can update their own submissions (before review)"
    ON public.submissions
    FOR UPDATE
    USING (
        labeler_id = auth.uid() AND
        reviewed_at IS NULL
    );
