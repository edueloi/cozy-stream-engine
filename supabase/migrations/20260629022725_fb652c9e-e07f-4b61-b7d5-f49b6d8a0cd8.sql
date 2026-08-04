
-- ========== meetings_v2 ==========
CREATE TABLE IF NOT EXISTS public.meetings_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google','microsoft')),
  external_event_id text,
  meeting_url text,
  title text,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','rescheduled','cancelled','completed','no_show')),
  happened boolean,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_via text NOT NULL DEFAULT 'manual' CHECK (created_via IN ('agent','manual','sync')),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_v2_org ON public.meetings_v2(organization_id);
CREATE INDEX IF NOT EXISTS idx_meetings_v2_lead ON public.meetings_v2(lead_id);
CREATE INDEX IF NOT EXISTS idx_meetings_v2_owner ON public.meetings_v2(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_v2_start ON public.meetings_v2(start_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_v2_provider_event ON public.meetings_v2(provider, external_event_id) WHERE external_event_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings_v2 TO authenticated;
GRANT ALL ON public.meetings_v2 TO service_role;
ALTER TABLE public.meetings_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_v2_org_select" ON public.meetings_v2 FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "meetings_v2_org_modify" ON public.meetings_v2 FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());
CREATE POLICY "meetings_v2_org_update" ON public.meetings_v2 FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());
CREATE POLICY "meetings_v2_org_delete" ON public.meetings_v2 FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND (owner_user_id = auth.uid() OR public.is_manager(auth.uid())));

CREATE TRIGGER trg_meetings_v2_updated BEFORE UPDATE ON public.meetings_v2
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_meetings_v2_org BEFORE INSERT ON public.meetings_v2
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- ========== scheduling_logs ==========
CREATE TABLE IF NOT EXISTS public.scheduling_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lead_id uuid,
  user_id uuid,
  action text NOT NULL,
  provider text,
  request_ms integer,
  http_status integer,
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduling_logs_org_created ON public.scheduling_logs(organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.scheduling_logs TO authenticated;
GRANT ALL ON public.scheduling_logs TO service_role;
ALTER TABLE public.scheduling_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scheduling_logs_org_select" ON public.scheduling_logs FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() AND (user_id = auth.uid() OR public.is_manager(auth.uid())));
CREATE POLICY "scheduling_logs_org_insert" ON public.scheduling_logs FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());
CREATE TRIGGER trg_scheduling_logs_org BEFORE INSERT ON public.scheduling_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

-- ========== app_settings additions ==========
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS meeting_default_duration_min integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS meeting_buffer_min integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS meeting_lunch_start text NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS meeting_lunch_end text NOT NULL DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS meeting_working_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS meeting_working_start text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS meeting_working_end text NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS meeting_min_lead_time_min integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS meeting_max_days_ahead integer NOT NULL DEFAULT 14;

-- ========== profiles additions ==========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS meeting_preferences jsonb;

-- ========== calendar_connections additions ==========
ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS needs_reauth boolean NOT NULL DEFAULT false;
