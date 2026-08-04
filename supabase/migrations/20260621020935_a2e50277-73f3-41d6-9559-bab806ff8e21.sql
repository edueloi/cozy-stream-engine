
-- 1. Add prospecting_search_id to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS prospecting_search_id uuid REFERENCES public.prospecting_searches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_prospecting_search ON public.leads(prospecting_search_id);

-- Backfill from existing source field
UPDATE public.leads
  SET prospecting_search_id = NULLIF(SUBSTRING(source FROM 'prospecting:([0-9a-f-]+)'), '')::uuid
  WHERE prospecting_search_id IS NULL
    AND source LIKE 'prospecting:%';

-- 2. Auto-cadence settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS auto_cadence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_cadence_default_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

-- 3. Trigger for auto-cadence on new leads
CREATE OR REPLACE FUNCTION public.apply_auto_cadence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT auto_cadence_enabled, auto_cadence_default_agent_id
    INTO s
    FROM public.app_settings
    WHERE organization_id = NEW.organization_id;
  IF s.auto_cadence_enabled IS TRUE THEN
    IF NEW.agent_id IS NULL AND s.auto_cadence_default_agent_id IS NOT NULL THEN
      NEW.agent_id := s.auto_cadence_default_agent_id;
    END IF;
    NEW.cadence_paused := false;
    IF NEW.cadence_day IS NULL OR NEW.cadence_day = 0 THEN
      NEW.cadence_day := 0;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_auto_cadence ON public.leads;
CREATE TRIGGER trg_leads_auto_cadence
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_auto_cadence();
