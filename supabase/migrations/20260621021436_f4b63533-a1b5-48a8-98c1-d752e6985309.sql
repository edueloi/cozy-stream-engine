
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
    -- only force "em_cadencia" if status is one of the early states
    IF NEW.status IN ('coletado', 'enriquecido', 'novo') THEN
      NEW.status := 'em_cadencia';
    END IF;
  END IF;
  RETURN NEW;
END $$;
