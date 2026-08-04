
-- Calendar connections per user
CREATE TABLE public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','microsoft')),
  email text,
  calendar_id text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  working_hours jsonb NOT NULL DEFAULT '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}'::jsonb,
  default_duration_min int NOT NULL DEFAULT 30,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_connections TO authenticated;
GRANT ALL ON public.calendar_connections TO service_role;

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own calendar connections"
  ON public.calendar_connections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org_id());

CREATE POLICY "managers read org calendar connections"
  ON public.calendar_connections FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE TRIGGER calendar_connections_set_updated_at
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Meetings linked to leads
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','microsoft')),
  provider_event_id text,
  title text,
  notes text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  meeting_url text,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('proposed','scheduled','cancelled','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners and managers access meetings"
  ON public.meetings FOR ALL
  TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (owner_id = auth.uid() OR public.is_manager(auth.uid()))
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (owner_id = auth.uid() OR public.is_manager(auth.uid()))
  );

CREATE INDEX idx_meetings_lead ON public.meetings(lead_id);
CREATE INDEX idx_meetings_owner_start ON public.meetings(owner_id, start_at);

CREATE TRIGGER meetings_set_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
