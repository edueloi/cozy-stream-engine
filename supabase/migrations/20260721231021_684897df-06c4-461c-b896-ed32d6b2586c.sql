
ALTER TABLE public.prospecting_searches
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.product_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS icp_id uuid REFERENCES public.ideal_customer_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preliminary_minimum_score numeric,
  ADD COLUMN IF NOT EXISTS final_minimum_score numeric,
  ADD COLUMN IF NOT EXISTS max_intelligence_credits integer,
  ADD COLUMN IF NOT EXISTS smart_flow_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smart_flow_status text,
  ADD COLUMN IF NOT EXISTS smart_flow_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS smart_flow_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS smart_flow_stop_reason text;

CREATE INDEX IF NOT EXISTS idx_prospecting_searches_product ON public.prospecting_searches(product_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_searches_icp ON public.prospecting_searches(icp_id);
CREATE INDEX IF NOT EXISTS idx_prospecting_searches_smart_status ON public.prospecting_searches(smart_flow_status);
CREATE INDEX IF NOT EXISTS idx_prospecting_searches_created ON public.prospecting_searches(created_at DESC);
