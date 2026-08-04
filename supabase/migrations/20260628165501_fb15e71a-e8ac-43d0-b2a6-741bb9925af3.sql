
-- Email connections (per user, per provider). Mirrors calendar_connections shape.
CREATE TABLE IF NOT EXISTS public.email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google','microsoft')),
  email text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  sender_name text,
  signature text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_connections TO authenticated;
GRANT ALL ON public.email_connections TO service_role;

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;

-- Owner can read/write own row
CREATE POLICY "email_conn_self_select" ON public.email_connections
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "email_conn_self_modify" ON public.email_connections
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_email_conn_updated_at ON public.email_connections;
CREATE TRIGGER trg_email_conn_updated_at BEFORE UPDATE ON public.email_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC: list connection status of all org members (for managers) or self
CREATE OR REPLACE FUNCTION public.list_org_email_status()
RETURNS TABLE(
  user_id uuid, name text, email text, provider text,
  connected boolean, external_email text, expires_at timestamptz, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH me AS (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  SELECT
    p.id, p.name, p.email,
    c.provider,
    (c.id IS NOT NULL AND COALESCE(c.enabled,false)) AS connected,
    c.email AS external_email,
    c.expires_at,
    c.updated_at
  FROM public.profiles p
  LEFT JOIN public.email_connections c
    ON c.user_id = p.id AND COALESCE(c.enabled,false) = true
  WHERE p.organization_id = (SELECT organization_id FROM me)
    AND (public.is_manager(auth.uid()) OR p.id = auth.uid());
$$;

-- Organization-level fallback sender email (used when no user has email connection)
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS fallback_sender_email text,
  ADD COLUMN IF NOT EXISTS fallback_sender_name text;
