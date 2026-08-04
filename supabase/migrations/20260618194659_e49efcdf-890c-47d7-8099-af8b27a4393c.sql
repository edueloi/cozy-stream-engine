-- 1) Estender calls
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS call_type text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS call_status text,
  ADD COLUMN IF NOT EXISTS voice_transcript jsonb,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS qualification_score integer,
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS objections_detected text[],
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS orbit_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS call_quality_score numeric(4,2);

CREATE INDEX IF NOT EXISTS calls_agent_id_idx ON public.calls(agent_id);
CREATE INDEX IF NOT EXISTS calls_call_type_idx ON public.calls(call_type);
CREATE INDEX IF NOT EXISTS calls_call_status_idx ON public.calls(call_status);

-- 2) Estender ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS voice_config jsonb;

-- 3) call_attempts
CREATE TABLE IF NOT EXISTS public.call_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  attempt_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'queued',
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_attempts TO authenticated;
GRANT ALL ON public.call_attempts TO service_role;

ALTER TABLE public.call_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view call_attempts"
  ON public.call_attempts FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "Managers manage call_attempts"
  ON public.call_attempts FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE TRIGGER call_attempts_set_updated_at
  BEFORE UPDATE ON public.call_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER call_attempts_set_org
  BEFORE INSERT ON public.call_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE INDEX IF NOT EXISTS call_attempts_org_idx ON public.call_attempts(organization_id);
CREATE INDEX IF NOT EXISTS call_attempts_status_idx ON public.call_attempts(status);
CREATE INDEX IF NOT EXISTS call_attempts_scheduled_idx ON public.call_attempts(scheduled_at);