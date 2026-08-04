
-- =========================================
-- ETAPA 2 — organization_id (NULLABLE) + backfill
-- =========================================

-- Adiciona coluna em todas as tabelas afetadas
ALTER TABLE public.profiles               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.leads                  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.messages               ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.calls                  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.activity_events        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.ai_agents              ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.agent_trainings        ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.cadence_variants       ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.lost_reasons           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.qualification_answers  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.app_settings           ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Indexes pra performance multi-tenant
CREATE INDEX IF NOT EXISTS idx_profiles_org              ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org                 ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_org              ON public.messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_calls_org                 ON public.calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_org       ON public.activity_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_org             ON public.ai_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_trainings_org       ON public.agent_trainings(organization_id);
CREATE INDEX IF NOT EXISTS idx_cadence_variants_org      ON public.cadence_variants(organization_id);
CREATE INDEX IF NOT EXISTS idx_lost_reasons_org          ON public.lost_reasons(organization_id);
CREATE INDEX IF NOT EXISTS idx_qualification_answers_org ON public.qualification_answers(organization_id);
CREATE INDEX IF NOT EXISTS idx_app_settings_org          ON public.app_settings(organization_id);

-- Backfill: todos os registros existentes vão para JCS
DO $$
DECLARE
  jcs_id uuid;
BEGIN
  SELECT id INTO jcs_id FROM public.organizations WHERE slug = 'jcs' LIMIT 1;
  IF jcs_id IS NULL THEN
    RAISE EXCEPTION 'JCS organization not found';
  END IF;

  UPDATE public.profiles               SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.leads                  SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.messages               SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.calls                  SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.activity_events        SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.ai_agents              SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.agent_trainings        SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.cadence_variants       SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.lost_reasons           SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.qualification_answers  SET organization_id = jcs_id WHERE organization_id IS NULL;
  UPDATE public.app_settings           SET organization_id = jcs_id WHERE organization_id IS NULL;
END $$;

-- handle_new_user: associar novo usuário à JCS por padrão (mantém comportamento atual)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  jcs_id uuid;
BEGIN
  SELECT id INTO jcs_id FROM public.organizations WHERE slug = 'jcs' LIMIT 1;

  INSERT INTO public.profiles (id, name, email, organization_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email, jcs_id)
  ON CONFLICT (id) DO UPDATE SET organization_id = COALESCE(public.profiles.organization_id, EXCLUDED.organization_id);

  IF (SELECT count(*) FROM public.profiles) = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'superadmin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'sdr') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $function$;

-- Helper current_org_id
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

-- set_lead_owner: também seta organization_id do lead a partir do usuário
CREATE OR REPLACE FUNCTION public.set_lead_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;
  RETURN NEW;
END $function$;
