
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS sip_server text,
  ADD COLUMN IF NOT EXISTS sip_ws_url text,
  ADD COLUMN IF NOT EXISTS sip_username text,
  ADD COLUMN IF NOT EXISTS sip_password text,
  ADD COLUMN IF NOT EXISTS sip_domain text,
  ADD COLUMN IF NOT EXISTS sip_display_name text;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS to_number text,
  ADD COLUMN IF NOT EXISTS from_number text,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;
