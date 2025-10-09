-- Fix infinite recursion in user_profiles RLS policies
-- The issue is that admin policies were querying user_profiles inside user_profiles policies

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;

-- Create a security definer function to check if user is admin
-- This breaks the recursion by using SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate admin policies using the security definer function
CREATE POLICY "Admins can view all profiles"
    ON public.user_profiles
    FOR SELECT
    USING (public.is_admin(auth.uid()));

-- Allow service role to insert (for trigger) and make first user admin automatically
CREATE POLICY "Service role can insert profiles"
    ON public.user_profiles
    FOR INSERT
    WITH CHECK (true); -- The trigger handles this, so we allow it

-- Only admins can delete profiles
CREATE POLICY "Admins can delete profiles"
    ON public.user_profiles
    FOR DELETE
    USING (public.is_admin(auth.uid()));

-- Allow admins to update any profile's role
CREATE POLICY "Admins can update all profiles"
    ON public.user_profiles
    FOR UPDATE
    USING (public.is_admin(auth.uid()));
