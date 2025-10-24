-- Fix infinite recursion in user_profiles policies
-- The issue: policies were checking user_profiles.role within user_profiles policies
-- Solution: Use a simpler approach that doesn't cause recursion

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.user_profiles;

-- Recreate policies without recursion
-- Users can always view their own profile (no recursion)
-- Already exists: "Users can view own profile" and "Users can update own profile"

-- Create a function to check if user is admin or super_admin (cached/memoized)
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id AND role IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Now create policies using this function (avoids recursion)
CREATE POLICY "Admins can view all profiles"
    ON public.user_profiles
    FOR SELECT
    USING (
        -- User can view their own profile OR user is admin/super_admin
        auth.uid() = id OR public.is_admin_or_super_admin(auth.uid())
    );

CREATE POLICY "Admins can insert profiles"
    ON public.user_profiles
    FOR INSERT
    WITH CHECK (
        public.is_admin_or_super_admin(auth.uid())
    );

CREATE POLICY "Admins can delete profiles"
    ON public.user_profiles
    FOR DELETE
    USING (
        public.is_admin_or_super_admin(auth.uid())
    );

-- Also update the UPDATE policy to allow admins to update any profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
    ON public.user_profiles
    FOR UPDATE
    USING (
        auth.uid() = id OR public.is_admin_or_super_admin(auth.uid())
    )
    WITH CHECK (
        auth.uid() = id OR public.is_admin_or_super_admin(auth.uid())
    );
