
-- 1. cadences table
CREATE TABLE IF NOT EXISTS public.cadences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'Personalizada',
  objective text,
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadences TO authenticated;
GRANT ALL ON public.cadences TO service_role;

ALTER TABLE public.cadences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cadences_select_org" ON public.cadences
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "cadences_insert_manager" ON public.cadences
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE POLICY "cadences_update_manager" ON public.cadences
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "cadences_delete_manager" ON public.cadences
  FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE TRIGGER cadences_set_updated_at
  BEFORE UPDATE ON public.cadences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS cadences_org_idx ON public.cadences(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS cadences_one_default_per_org
  ON public.cadences(organization_id) WHERE is_default IS TRUE;

-- 2. add cadence_id to cadence_variants (nullable, backward compatible)
ALTER TABLE public.cadence_variants
  ADD COLUMN IF NOT EXISTS cadence_id uuid REFERENCES public.cadences(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS cadence_variants_cadence_idx ON public.cadence_variants(cadence_id);

-- 3. add fields to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS active_cadence_id uuid REFERENCES public.cadences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cadence_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS cadence_current_day integer,
  ADD COLUMN IF NOT EXISTS cadence_status text NOT NULL DEFAULT 'not_started';

CREATE INDEX IF NOT EXISTS leads_active_cadence_idx ON public.leads(active_cadence_id);

-- 4. backfill: for each org with variants, create default cadence and link variants
DO $$
DECLARE
  org_id uuid;
  cad_id uuid;
BEGIN
  FOR org_id IN
    SELECT DISTINCT organization_id FROM public.cadence_variants WHERE organization_id IS NOT NULL
  LOOP
    -- skip if there is already a default cadence
    SELECT id INTO cad_id FROM public.cadences
      WHERE organization_id = org_id AND is_default = true LIMIT 1;
    IF cad_id IS NULL THEN
      INSERT INTO public.cadences (organization_id, name, description, category, objective, status, is_default)
      VALUES (org_id, 'Cadência Padrão Atual', 'Cadência migrada das variantes A/B existentes.', 'Personalizada', 'Outbound padrão', 'active', true)
      RETURNING id INTO cad_id;
    END IF;
    UPDATE public.cadence_variants
      SET cadence_id = cad_id
      WHERE organization_id = org_id AND cadence_id IS NULL;
  END LOOP;
END $$;
