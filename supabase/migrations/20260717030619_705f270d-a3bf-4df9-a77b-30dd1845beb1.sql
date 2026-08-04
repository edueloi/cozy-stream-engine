
-- =========================================================================
-- JCS Data Engine — PR 1 (Fundação)
-- Migration 100% aditiva. Nada existente é alterado destrutivamente.
-- =========================================================================

-- 1) Feature flag ---------------------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS jcs_data_engine_enabled boolean NOT NULL DEFAULT false;

UPDATE public.app_settings
   SET jcs_data_engine_enabled = true
 WHERE organization_id IN (SELECT id FROM public.organizations WHERE slug = 'jcs');

-- 2) Colunas aditivas em prospecting_results ------------------------------
ALTER TABLE public.prospecting_results
  ADD COLUMN IF NOT EXISTS data_quality_score integer,
  ADD COLUMN IF NOT EXISTS contact_confidence text,
  ADD COLUMN IF NOT EXISTS decision_maker_status text,
  ADD COLUMN IF NOT EXISTS possible_whatsapp text,
  ADD COLUMN IF NOT EXISTS whatsapp_confidence text;

-- 3) provider_credentials -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL = plataforma
  provider text NOT NULL,
  credential_mode text NOT NULL DEFAULT 'platform', -- platform | organization | disabled
  encrypted_secret_reference text,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'unknown',
  last_test_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.provider_credentials TO authenticated;
GRANT ALL ON public.provider_credentials TO service_role;
ALTER TABLE public.provider_credentials ENABLE ROW LEVEL SECURITY;
-- SuperAdmin lê tudo; org lê apenas suas próprias credenciais org-scoped
CREATE POLICY provider_credentials_select ON public.provider_credentials
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = public.current_org_id())
  );
CREATE TRIGGER provider_credentials_touch
  BEFORE UPDATE ON public.provider_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) provider_capabilities ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  capability text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  estimated_cost numeric(10,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  credits_cost integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, capability)
);
GRANT SELECT ON public.provider_capabilities TO authenticated;
GRANT ALL ON public.provider_capabilities TO service_role;
ALTER TABLE public.provider_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_capabilities_select ON public.provider_capabilities
  FOR SELECT TO authenticated USING (true);
CREATE TRIGGER provider_capabilities_touch
  BEFORE UPDATE ON public.provider_capabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) provider_budget_limits -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_budget_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  daily_limit integer,
  monthly_limit integer,
  daily_budget numeric(12,2),
  monthly_budget numeric(12,2),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_budget_limits TO authenticated;
GRANT ALL ON public.provider_budget_limits TO service_role;
ALTER TABLE public.provider_budget_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_budget_limits_all ON public.provider_budget_limits
  FOR ALL TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = public.current_org_id())
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (organization_id IS NOT NULL AND organization_id = public.current_org_id())
  );
CREATE TRIGGER provider_budget_limits_touch
  BEFORE UPDATE ON public.provider_budget_limits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) enrichment_jobs ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospecting_search_id uuid REFERENCES public.prospecting_searches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending|processing|completed|failed|budget_limit_reached|target_reached
  target_good_leads integer,
  max_companies integer,
  max_credits integer,
  companies_analyzed integer NOT NULL DEFAULT 0,
  companies_enriched integer NOT NULL DEFAULT 0,
  good_leads integer NOT NULL DEFAULT 0,
  review_leads integer NOT NULL DEFAULT 0,
  rejected_leads integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  cost_estimated numeric(12,4) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.enrichment_jobs TO authenticated;
GRANT ALL ON public.enrichment_jobs TO service_role;
ALTER TABLE public.enrichment_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrichment_jobs_all ON public.enrichment_jobs
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());
CREATE TRIGGER enrichment_jobs_touch
  BEFORE UPDATE ON public.enrichment_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) enrichment_steps -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enrichment_job_id uuid REFERENCES public.enrichment_jobs(id) ON DELETE CASCADE,
  prospecting_result_id uuid REFERENCES public.prospecting_results(id) ON DELETE CASCADE,
  provider text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|success|failed|skipped|cache_hit
  cost_estimated numeric(10,4) NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  cache_hit boolean NOT NULL DEFAULT false,
  error_code text,
  fields_written text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.enrichment_steps TO authenticated;
GRANT ALL ON public.enrichment_steps TO service_role;
ALTER TABLE public.enrichment_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrichment_steps_all ON public.enrichment_steps
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- 8) enrichment_cache -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrichment_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_type text NOT NULL,   -- cnpj | domain | phone | company_id
  key_value text NOT NULL,
  field text NOT NULL,
  value jsonb,
  provider text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key_type, key_value, field)
);
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_lookup
  ON public.enrichment_cache (organization_id, key_type, key_value);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrichment_cache TO authenticated;
GRANT ALL ON public.enrichment_cache TO service_role;
ALTER TABLE public.enrichment_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrichment_cache_all ON public.enrichment_cache
  FOR ALL TO authenticated
  USING (organization_id IS NULL OR organization_id = public.current_org_id())
  WITH CHECK (organization_id IS NULL OR organization_id = public.current_org_id());
CREATE TRIGGER enrichment_cache_touch
  BEFORE UPDATE ON public.enrichment_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9) intelligence_credit_events -------------------------------------------
CREATE TABLE IF NOT EXISTS public.intelligence_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  operation text NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  prospecting_search_id uuid REFERENCES public.prospecting_searches(id) ON DELETE SET NULL,
  prospecting_result_id uuid REFERENCES public.prospecting_results(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.intelligence_credit_events TO authenticated;
GRANT ALL ON public.intelligence_credit_events TO service_role;
ALTER TABLE public.intelligence_credit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY intelligence_credit_events_all ON public.intelligence_credit_events
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- 10) company_opportunity_signals -----------------------------------------
CREATE TABLE IF NOT EXISTS public.company_opportunity_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prospecting_result_id uuid REFERENCES public.prospecting_results(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  hypothesis text NOT NULL,       -- sempre apresentado como hipótese
  confidence text NOT NULL DEFAULT 'low', -- high|medium|low
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.company_opportunity_signals TO authenticated;
GRANT ALL ON public.company_opportunity_signals TO service_role;
ALTER TABLE public.company_opportunity_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_opportunity_signals_all ON public.company_opportunity_signals
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());
