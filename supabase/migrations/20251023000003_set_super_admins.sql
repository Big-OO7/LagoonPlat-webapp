-- Set specific users as super admins
UPDATE public.user_profiles
SET role = 'super_admin'
WHERE email IN ('omshastri@gmail.com', 'sebastian@withmetis.ai');
