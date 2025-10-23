-- Add 'super_admin' to the user_role enum
-- Note: Adding enum values must be done carefully
DO $$
BEGIN
    -- Only add if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'super_admin' AND enumtypid = 'user_role'::regtype) THEN
        ALTER TYPE user_role ADD VALUE 'super_admin';
    END IF;
END $$;
