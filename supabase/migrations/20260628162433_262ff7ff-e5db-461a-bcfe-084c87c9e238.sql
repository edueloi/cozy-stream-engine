
-- Per-user calendar architecture: add fallback routing fields and a safe org-status RPC.

ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS buffer_before_min int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_min int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calendar_id text;

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS default_calendar_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS default_calendar_fallback_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Safe RPC: returns only non-secret status fields for users in the caller's organization.
-- Tokens are NEVER returned. Managers see the whole org; others see only themselves.
CREATE OR REPLACE FUNCTION public.list_org_calendar_status()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  provider text,
  connected boolean,
  external_email text,
  expires_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  )
  SELECT
    p.id AS user_id,
    p.name,
    p.email,
    c.provider,
    (c.id IS NOT NULL AND COALESCE(c.enabled, false)) AS connected,
    c.email AS external_email,
    c.expires_at,
    c.updated_at
  FROM public.profiles p
  LEFT JOIN public.calendar_connections c
    ON c.user_id = p.id AND COALESCE(c.enabled, false) = true
  WHERE p.organization_id = (SELECT organization_id FROM me)
    AND (
      public.is_manager(auth.uid())
      OR p.id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_org_calendar_status() TO authenticated;
