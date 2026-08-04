
ALTER TABLE public.prospecting_results
  ADD COLUMN IF NOT EXISTS preliminary_status text,
  ADD COLUMN IF NOT EXISTS smart_flow_status text,
  ADD COLUMN IF NOT EXISTS smart_flow_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS decision_makers_status text;

ALTER TABLE public.prospecting_searches
  ADD COLUMN IF NOT EXISTS total_pre_scored integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_promissores integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_potenciais integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_frios integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_descartados_icp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_saved integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_spent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_processing_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS smart_flow_stats jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_prospecting_results_smart_flow_status
  ON public.prospecting_results (organization_id, smart_flow_status);
CREATE INDEX IF NOT EXISTS idx_prospecting_results_preliminary_status
  ON public.prospecting_results (organization_id, preliminary_status);
