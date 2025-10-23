-- Update tasks table RLS policies to restrict DELETE to super_admin only
-- while allowing admin to SELECT, INSERT, UPDATE

-- Drop the existing "Admins can do everything with tasks" policy
DROP POLICY IF EXISTS "Admins can do everything with tasks" ON public.tasks;

-- Create separate policies for different operations
-- Admins and Super Admins can SELECT all tasks
CREATE POLICY "Admins can view all tasks"
    ON public.tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Admins and Super Admins can INSERT tasks
CREATE POLICY "Admins can create tasks"
    ON public.tasks
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Admins and Super Admins can UPDATE tasks
CREATE POLICY "Admins can update tasks"
    ON public.tasks
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- ONLY Super Admins can DELETE tasks
CREATE POLICY "Only super admins can delete tasks"
    ON public.tasks
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Update other tables to also allow super_admin access
-- Artifacts
DROP POLICY IF EXISTS "Admins can do everything with artifacts" ON public.artifacts;
CREATE POLICY "Admins can do everything with artifacts"
    ON public.artifacts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Rubrics
DROP POLICY IF EXISTS "Admins can do everything with rubrics" ON public.rubrics;
CREATE POLICY "Admins can do everything with rubrics"
    ON public.rubrics
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Task Assignments
DROP POLICY IF EXISTS "Admins can do everything with assignments" ON public.task_assignments;
CREATE POLICY "Admins can do everything with assignments"
    ON public.task_assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

-- Submissions - Admins can review
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Admins can update submissions (review)" ON public.submissions;

CREATE POLICY "Admins can view all submissions"
    ON public.submissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );

CREATE POLICY "Admins can update submissions (review)"
    ON public.submissions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
        )
    );
