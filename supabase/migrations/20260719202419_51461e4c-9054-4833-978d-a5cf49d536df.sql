
-- JCS SDR — Sprint 1 / PR 02
-- Persistência dedicada do Enrichment Orchestrator.
-- Aditiva; enrichment_jobs permanece intacta durante a transição.

CREATE TABLE IF NOT EXISTS public.enrichment_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  execution_id uuid NOT NULL UNIQUE,
  prospecting_search_id uuid,
  prospecting_result_id uuid,
  product_id uuid,
  icp_id uuid,
  status text NOT NULL DEFAULT 'pending',
  strategy text,
  plan_json jsonb,
  result_json jsonb,
  error_json jsonb,
  cost_cents integer NOT NULL DEFAULT 0,
  spent_credits integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enrichment_executions_status_check CHECK (
    status IN ('pending','planning','processing','completed','partial','failed','cancelled','budget_exhausted','quality_reached')
  )
);

CREATE INDEX IF NOT EXISTS enrichment_executions_org_idx ON public.enrichment_executions(organization_id);
CREATE INDEX IF NOT EXISTS enrichment_executions_exec_idx ON public.enrichment_executions(execution_id);
CREATE INDEX IF NOT EXISTS enrichment_executions_status_idx ON public.enrichment_executions(status);
CREATE INDEX IF NOT EXISTS enrichment_executions_search_idx ON public.enrichment_executions(prospecting_search_id);
CREATE INDEX IF NOT EXISTS enrichment_executions_result_idx ON public.enrichment_executions(prospecting_result_id);
CREATE INDEX IF NOT EXISTS enrichment_executions_created_idx ON public.enrichment_executions(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrichment_executions TO authenticated;
GRANT ALL ON public.enrichment_executions TO service_role;

ALTER TABLE public.enrichment_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enrichment_executions_org_select" ON public.enrichment_executions
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_org_id()
    OR public.is_superadmin(auth.uid())
  );

CREATE POLICY "enrichment_executions_org_insert" ON public.enrichment_executions
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    OR public.is_superadmin(auth.uid())
  );

CREATE POLICY "enrichment_executions_org_update" ON public.enrichment_executions
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    OR public.is_superadmin(auth.uid())
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    OR public.is_superadmin(auth.uid())
  );

CREATE POLICY "enrichment_executions_org_delete" ON public.enrichment_executions
  FOR DELETE TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE TRIGGER enrichment_executions_set_updated_at
  BEFORE UPDATE ON public.enrichment_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
