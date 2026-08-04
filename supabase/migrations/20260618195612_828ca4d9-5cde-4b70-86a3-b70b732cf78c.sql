-- Orbit CRM integration: lead fields + sync logs
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS orbit_contact_id text,
  ADD COLUMN IF NOT EXISTS orbit_company_id text,
  ADD COLUMN IF NOT EXISTS orbit_deal_id text,
  ADD COLUMN IF NOT EXISTS orbit_pipeline_id text,
  ADD COLUMN IF NOT EXISTS orbit_stage_id text,
  ADD COLUMN IF NOT EXISTS orbit_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS orbit_sync_status text,
  ADD COLUMN IF NOT EXISTS orbit_sync_error text;

CREATE INDEX IF NOT EXISTS leads_orbit_deal_id_idx ON public.leads(orbit_deal_id);

CREATE TABLE IF NOT EXISTS public.orbit_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  status text NOT NULL,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_sync_logs TO authenticated;
GRANT ALL ON public.orbit_sync_logs TO service_role;

ALTER TABLE public.orbit_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read orbit sync logs"
  ON public.orbit_sync_logs FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE INDEX IF NOT EXISTS orbit_sync_logs_org_idx ON public.orbit_sync_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orbit_sync_logs_lead_idx ON public.orbit_sync_logs(lead_id);