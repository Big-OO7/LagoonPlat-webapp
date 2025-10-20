-- Fix RLS policy to allow labelers to update revision_requested submissions
-- The previous policy blocked updates when reviewed_at was set,
-- but admins set reviewed_at when requesting revisions, which blocked resubmission

DROP POLICY IF EXISTS "Labelers can update their own submissions (before review)" ON public.submissions;

CREATE POLICY "Labelers can update their own submissions (before final review)"
    ON public.submissions
    FOR UPDATE
    USING (
        labeler_id = auth.uid() AND
        -- Allow updates for:
        -- 1. Drafts (not yet reviewed)
        -- 2. Revision requests (reviewed but need changes)
        -- Block updates for:
        -- 1. Final reviewed submissions
        -- 2. Completed submissions
        (reviewed_at IS NULL OR status = 'revision_requested')
    );
