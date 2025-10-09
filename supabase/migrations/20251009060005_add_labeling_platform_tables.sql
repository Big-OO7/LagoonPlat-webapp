-- Create enum for task status
CREATE TYPE task_status AS ENUM ('draft', 'assigned', 'in_progress', 'submitted', 'reviewed', 'completed');

-- Create enum for rubric field types
CREATE TYPE rubric_field_type AS ENUM ('text', 'number', 'select', 'multiselect', 'textarea', 'rating', 'boolean');

-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'draft',
    deadline TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create artifacts table for file uploads
CREATE TABLE IF NOT EXISTS public.artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'pdf', 'excel', etc.
    file_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL, -- Path in Supabase storage
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create rubrics table
CREATE TABLE IF NOT EXISTS public.rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    schema JSONB NOT NULL, -- JSON schema for the rubric fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create task assignments table
CREATE TABLE IF NOT EXISTS public.task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
    labeler_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(task_id, labeler_id)
);

-- Create submissions table
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
    labeler_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    rubric_data JSONB NOT NULL, -- Filled out rubric data
    status task_status NOT NULL DEFAULT 'submitted',
    feedback TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(task_id, labeler_id)
);

-- Enable Row Level Security
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tasks
CREATE POLICY "Admins can do everything with tasks"
    ON public.tasks
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Labelers can view assigned tasks"
    ON public.tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.task_assignments
            WHERE task_id = tasks.id AND labeler_id = auth.uid()
        )
    );

-- RLS Policies for artifacts
CREATE POLICY "Admins can do everything with artifacts"
    ON public.artifacts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Labelers can view artifacts for assigned tasks"
    ON public.artifacts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.task_assignments
            WHERE task_id = artifacts.task_id AND labeler_id = auth.uid()
        )
    );

-- RLS Policies for rubrics
CREATE POLICY "Admins can do everything with rubrics"
    ON public.rubrics
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Labelers can view rubrics for assigned tasks"
    ON public.rubrics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.task_assignments
            WHERE task_id = rubrics.task_id AND labeler_id = auth.uid()
        )
    );

-- RLS Policies for task_assignments
CREATE POLICY "Admins can manage task assignments"
    ON public.task_assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Labelers can view their own assignments"
    ON public.task_assignments
    FOR SELECT
    USING (labeler_id = auth.uid());

-- RLS Policies for submissions
CREATE POLICY "Admins can view all submissions"
    ON public.submissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update submissions (for review)"
    ON public.submissions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Labelers can view their own submissions"
    ON public.submissions
    FOR SELECT
    USING (labeler_id = auth.uid());

CREATE POLICY "Labelers can create submissions for assigned tasks"
    ON public.submissions
    FOR INSERT
    WITH CHECK (
        labeler_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.task_assignments
            WHERE task_id = submissions.task_id AND labeler_id = auth.uid()
        )
    );

CREATE POLICY "Labelers can update their own submissions (before review)"
    ON public.submissions
    FOR UPDATE
    USING (
        labeler_id = auth.uid() AND
        status = 'submitted' AND
        reviewed_at IS NULL
    );

-- Create storage bucket for artifacts
INSERT INTO storage.buckets (id, name, public)
VALUES ('artifacts', 'artifacts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for artifacts bucket
CREATE POLICY "Admins can upload artifacts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'artifacts' AND
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Admins can update artifacts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'artifacts' AND
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Admins can delete artifacts"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'artifacts' AND
    EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Users can view artifacts for assigned tasks"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'artifacts');

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    new.updated_at = NOW();
    RETURN new;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_task_updated
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_rubric_updated
    BEFORE UPDATE ON public.rubrics
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_submission_updated
    BEFORE UPDATE ON public.submissions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create indexes for better performance
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_artifacts_task_id ON public.artifacts(task_id);
CREATE INDEX idx_rubrics_task_id ON public.rubrics(task_id);
CREATE INDEX idx_task_assignments_task_id ON public.task_assignments(task_id);
CREATE INDEX idx_task_assignments_labeler_id ON public.task_assignments(labeler_id);
CREATE INDEX idx_submissions_task_id ON public.submissions(task_id);
CREATE INDEX idx_submissions_labeler_id ON public.submissions(labeler_id);
CREATE INDEX idx_submissions_status ON public.submissions(status);
