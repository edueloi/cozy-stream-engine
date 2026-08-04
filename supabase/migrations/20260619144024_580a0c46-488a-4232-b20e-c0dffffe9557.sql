-- Make app_settings per-organization (was single global row id=1)
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_id_check;
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;

-- Ensure existing row has an organization_id
UPDATE public.app_settings SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
WHERE organization_id IS NULL;

ALTER TABLE public.app_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (organization_id);
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS id;

-- Create a fresh empty settings row for each organization that doesn't have one
INSERT INTO public.app_settings (organization_id)
SELECT o.id FROM public.organizations o
LEFT JOIN public.app_settings s ON s.organization_id = o.id
WHERE s.organization_id IS NULL;

-- Auto-create app_settings whenever a new organization is created
CREATE OR REPLACE FUNCTION public.create_org_app_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.app_settings (organization_id) VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_org_app_settings ON public.organizations;
CREATE TRIGGER trg_create_org_app_settings
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.create_org_app_settings();