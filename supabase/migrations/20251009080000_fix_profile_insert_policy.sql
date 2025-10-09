-- Fix profile insertion for new users
-- The issue is that the INSERT policy needs to allow authenticated users to create their own profile

-- Drop the restrictive insert policy
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.user_profiles;

-- Allow authenticated users to insert their own profile
-- This is needed for the fallback profile creation in signup and dashboard
CREATE POLICY "Users can insert own profile"
    ON public.user_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Also ensure the trigger function has proper permissions
-- Recreate it with explicit SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, role)
    VALUES (
        new.id,
        new.email,
        CASE
            WHEN new.email = 'omshastri@gmail.com' THEN 'admin'::user_role
            ELSE 'labeler'::user_role
        END
    );
    RETURN new;
EXCEPTION
    WHEN unique_violation THEN
        -- Profile already exists, ignore
        RETURN new;
    WHEN OTHERS THEN
        -- Log error but don't fail the user creation
        RAISE WARNING 'Error creating user profile: %', SQLERRM;
        RETURN new;
END;
$$ LANGUAGE plpgsql;
