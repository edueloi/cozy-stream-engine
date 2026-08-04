ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS send_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5];