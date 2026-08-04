
-- Normalize phone columns and add lookup RPC for webhook
CREATE OR REPLACE FUNCTION public.normalize_lead_phones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.whatsapp IS NOT NULL THEN
    NEW.whatsapp := regexp_replace(NEW.whatsapp, '\D', '', 'g');
    IF NEW.whatsapp = '' THEN NEW.whatsapp := NULL; END IF;
  END IF;
  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := regexp_replace(NEW.telefone, '\D', '', 'g');
    IF NEW.telefone = '' THEN NEW.telefone := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_normalize_phones ON public.leads;
CREATE TRIGGER leads_normalize_phones
BEFORE INSERT OR UPDATE OF whatsapp, telefone ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.normalize_lead_phones();

-- Backfill existing rows
UPDATE public.leads
SET whatsapp = NULLIF(regexp_replace(coalesce(whatsapp,''), '\D', '', 'g'), ''),
    telefone = NULLIF(regexp_replace(coalesce(telefone,''), '\D', '', 'g'), '');

-- RPC for webhook lead lookup by phone digits
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(_org_id uuid, _tail text)
RETURNS TABLE (
  id uuid,
  whatsapp text,
  telefone text,
  status text,
  ai_paused boolean,
  opt_out boolean,
  agent_id uuid,
  razao_social text,
  nome_fantasia text,
  segmento text,
  cidade text,
  estado text,
  notes text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.whatsapp, l.telefone, l.status, l.ai_paused, l.opt_out, l.agent_id,
         l.razao_social, l.nome_fantasia, l.segmento, l.cidade, l.estado, l.notes
  FROM public.leads l
  WHERE l.organization_id = _org_id
    AND (
      regexp_replace(coalesce(l.whatsapp,''), '\D', '', 'g') LIKE '%' || _tail || '%'
      OR regexp_replace(coalesce(l.telefone,''), '\D', '', 'g') LIKE '%' || _tail || '%'
    )
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.find_lead_by_phone(uuid, text) TO service_role, authenticated;
