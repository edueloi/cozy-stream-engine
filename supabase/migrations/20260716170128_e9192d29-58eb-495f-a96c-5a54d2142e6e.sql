
-- Feature flag
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS smart_prospect_engine_enabled boolean NOT NULL DEFAULT false;

-- ICP table
CREATE TABLE public.ideal_customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  product_or_service text,
  status text NOT NULL DEFAULT 'active',
  criteria_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  weights_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  minimum_score integer NOT NULL DEFAULT 80,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ideal_customer_profiles TO authenticated;
GRANT ALL ON public.ideal_customer_profiles TO service_role;

ALTER TABLE public.ideal_customer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "icp_org_select" ON public.ideal_customer_profiles
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "icp_org_insert" ON public.ideal_customer_profiles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "icp_org_update" ON public.ideal_customer_profiles
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "icp_org_delete" ON public.ideal_customer_profiles
  FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id());

CREATE TRIGGER icp_set_org BEFORE INSERT ON public.ideal_customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER icp_updated_at BEFORE UPDATE ON public.ideal_customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Scores table
CREATE TABLE public.prospecting_company_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  prospecting_result_id uuid NOT NULL REFERENCES public.prospecting_results(id) ON DELETE CASCADE,
  icp_id uuid NOT NULL REFERENCES public.ideal_customer_profiles(id) ON DELETE CASCADE,
  icp_score integer NOT NULL DEFAULT 0,
  classification text NOT NULL DEFAULT 'outside_profile',
  matched_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  disqualifying_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualified_for_import boolean NOT NULL DEFAULT false,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prospecting_result_id, icp_id)
);

CREATE INDEX prospecting_company_scores_result_idx ON public.prospecting_company_scores(prospecting_result_id);
CREATE INDEX prospecting_company_scores_icp_idx ON public.prospecting_company_scores(icp_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospecting_company_scores TO authenticated;
GRANT ALL ON public.prospecting_company_scores TO service_role;

ALTER TABLE public.prospecting_company_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcs_org_select" ON public.prospecting_company_scores
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "pcs_org_insert" ON public.prospecting_company_scores
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "pcs_org_update" ON public.prospecting_company_scores
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "pcs_org_delete" ON public.prospecting_company_scores
  FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id());

CREATE TRIGGER pcs_set_org BEFORE INSERT ON public.prospecting_company_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER pcs_updated_at BEFORE UPDATE ON public.prospecting_company_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
