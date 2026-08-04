
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS google_oauth_client_id text,
  ADD COLUMN IF NOT EXISTS google_oauth_client_secret text,
  ADD COLUMN IF NOT EXISTS ms_oauth_client_id text,
  ADD COLUMN IF NOT EXISTS ms_oauth_client_secret text,
  ADD COLUMN IF NOT EXISTS ms_oauth_tenant text DEFAULT 'common';
