-- Set the first user (omshastri@gmail.com) as admin
-- This will allow the admin user to access the admin dashboard

UPDATE public.user_profiles
SET role = 'admin'
WHERE email = 'omshastri@gmail.com';

-- If the profile doesn't exist yet, we'll ensure it gets created as admin
-- by updating the trigger function to check for this specific email

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
