
-- 1) Add superadmin role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';
