
-- Feature flag
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS universal_icp_enabled boolean NOT NULL DEFAULT false;

-- product_catalog table
CREATE TABLE IF NOT EXISTS public.product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  icp_id uuid REFERENCES public.ideal_customer_profiles(id) ON DELETE SET NULL,
  produto_padrao boolean NOT NULL DEFAULT false,
  icone text,
  cor text,
  ordem integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_catalog_org_idx ON public.product_catalog(organization_id);
CREATE INDEX IF NOT EXISTS product_catalog_icp_idx ON public.product_catalog(icp_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_catalog TO authenticated;
GRANT ALL ON public.product_catalog TO service_role;

ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_catalog_select_own_org"
  ON public.product_catalog FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "product_catalog_insert_managers"
  ON public.product_catalog FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (public.is_superadmin(auth.uid()) OR public.is_manager(auth.uid()))
  );

CREATE POLICY "product_catalog_update_managers"
  ON public.product_catalog FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (public.is_superadmin(auth.uid()) OR public.is_manager(auth.uid()))
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (public.is_superadmin(auth.uid()) OR public.is_manager(auth.uid()))
  );

CREATE POLICY "product_catalog_delete_managers"
  ON public.product_catalog FOR DELETE
  TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (public.is_superadmin(auth.uid()) OR public.is_manager(auth.uid()))
  );

-- updated_at trigger (reuse existing set_updated_at)
DROP TRIGGER IF EXISTS product_catalog_set_updated_at ON public.product_catalog;
CREATE TRIGGER product_catalog_set_updated_at
  BEFORE UPDATE ON public.product_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed helper
CREATE OR REPLACE FUNCTION public.seed_default_product_catalog(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  defaults jsonb := '[
    {"nome":"Gestão de TI","icone":"server","cor":"#3B82F6","ordem":1},
    {"nome":"Firewall","icone":"shield","cor":"#EF4444","ordem":2},
    {"nome":"Backup","icone":"database","cor":"#8B5CF6","ordem":3},
    {"nome":"Microsoft 365","icone":"mail","cor":"#0EA5E9","ordem":4},
    {"nome":"LGPD","icone":"lock","cor":"#10B981","ordem":5},
    {"nome":"SOC","icone":"eye","cor":"#F59E0B","ordem":6}
  ]'::jsonb;
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(defaults) LOOP
    INSERT INTO public.product_catalog (organization_id, nome, icone, cor, ordem, status)
    SELECT _org, item->>'nome', item->>'icone', item->>'cor', (item->>'ordem')::int, 'active'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_catalog
      WHERE organization_id = _org AND nome = item->>'nome'
    );
  END LOOP;
END $$;

-- Trigger to seed on new organization
CREATE OR REPLACE FUNCTION public.seed_product_catalog_on_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_product_catalog(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organizations_seed_product_catalog ON public.organizations;
CREATE TRIGGER organizations_seed_product_catalog
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.seed_product_catalog_on_org();

-- Backfill existing organizations
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_default_product_catalog(o.id);
  END LOOP;
END $$;
