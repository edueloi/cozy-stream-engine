
-- ============================================================
-- FASE 1 — Pré-Score ICP (aditivo, feature-flagged)
-- ============================================================

-- 1) Feature flag
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS pre_icp_scoring_enabled boolean NOT NULL DEFAULT false;

-- 2) Pré-score mínimo por ICP
ALTER TABLE public.ideal_customer_profiles
  ADD COLUMN IF NOT EXISTS preliminary_minimum_score integer NOT NULL DEFAULT 70;

-- 3) Marcador em regras
ALTER TABLE public.icp_rules
  ADD COLUMN IF NOT EXISTS requires_enrichment boolean NOT NULL DEFAULT false;

-- 4) Pré-score e estágio no resultado
ALTER TABLE public.prospecting_results
  ADD COLUMN IF NOT EXISTS preliminary_score integer NULL,
  ADD COLUMN IF NOT EXISTS pre_score_stage text NULL;

-- 5) Meta e limite por pesquisa
ALTER TABLE public.prospecting_searches
  ADD COLUMN IF NOT EXISTS target_good_leads integer NULL,
  ADD COLUMN IF NOT EXISTS max_companies_to_analyze integer NULL;

-- 6) Eventos de uso de provedores pagos
CREATE TABLE IF NOT EXISTS public.provider_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prospecting_search_id uuid NULL,
  prospecting_result_id uuid NULL,
  provider text NOT NULL,
  operation text NOT NULL,
  units integer NOT NULL DEFAULT 1,
  estimated_cost numeric(12,4) NULL,
  success boolean NOT NULL DEFAULT true,
  skipped_reason text NULL,
  estimated_cost_avoided numeric(12,4) NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pue_org_created
  ON public.provider_usage_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pue_search
  ON public.provider_usage_events (prospecting_search_id);

GRANT SELECT ON public.provider_usage_events TO authenticated;
GRANT ALL ON public.provider_usage_events TO service_role;

ALTER TABLE public.provider_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read provider_usage_events"
  ON public.provider_usage_events FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id());

-- 7) Ativa flag somente para JCS
UPDATE public.app_settings
   SET pre_icp_scoring_enabled = true
 WHERE organization_id IN (SELECT id FROM public.organizations WHERE slug = 'jcs');
