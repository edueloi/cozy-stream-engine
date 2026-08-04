ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS smtp_use_ssl boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smtp_use_tls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS smtp_auth_enabled boolean NOT NULL DEFAULT true;