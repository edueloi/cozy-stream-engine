ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS smart_flow_ui_enabled BOOLEAN NOT NULL DEFAULT false;
UPDATE public.app_settings s SET smart_flow_ui_enabled = true
  WHERE EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = s.organization_id AND o.slug = 'jcs');