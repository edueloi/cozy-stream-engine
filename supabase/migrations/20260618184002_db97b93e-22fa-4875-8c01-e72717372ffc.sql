
-- =========================================
-- ETAPA 3 — Triggers auto-org + RLS por organization_id
-- =========================================

-- Helper genérico: BEFORE INSERT seta organization_id se nulo
CREATE OR REPLACE FUNCTION public.set_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.current_org_id();
  END IF;
  RETURN NEW;
END $$;

-- Aplicar trigger em todas as tabelas (exceto leads, que já tem set_lead_owner cuidando)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'messages','calls','activity_events','ai_agents','agent_trainings',
    'cadence_variants','lost_reasons','qualification_answers','app_settings'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_org_%I ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_set_org_%I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();', t, t);
  END LOOP;
END $$;

-- =========================================
-- RLS: endurecer organizations (cada user vê só a sua; superadmin vê todas)
-- =========================================
DROP POLICY IF EXISTS organizations_select_all_auth ON public.organizations;

CREATE POLICY organizations_select_own
  ON public.organizations FOR SELECT
  TO authenticated
  USING (id = public.current_org_id() OR public.is_superadmin(auth.uid()));

CREATE POLICY organizations_update_admin
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (
    (id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'superadmin'::app_role]))
    OR public.is_superadmin(auth.uid())
  )
  WITH CHECK (
    (id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'superadmin'::app_role]))
    OR public.is_superadmin(auth.uid())
  );

-- =========================================
-- Subscriptions / billing_history / payments: membros leem da própria org
-- =========================================
CREATE POLICY subscriptions_select_member
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

CREATE POLICY billing_history_select_member
  ON public.billing_history FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

CREATE POLICY payments_select_member
  ON public.payments FOR SELECT
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- =========================================
-- RLS por org nas tabelas operacionais (additive — restringem ainda mais)
-- =========================================

-- LEADS
CREATE POLICY leads_org_isolation
  ON public.leads FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- MESSAGES
CREATE POLICY messages_org_isolation
  ON public.messages FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- CALLS
CREATE POLICY calls_org_isolation
  ON public.calls FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- ACTIVITY_EVENTS
CREATE POLICY activity_events_org_isolation
  ON public.activity_events FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- AI_AGENTS
CREATE POLICY ai_agents_org_isolation
  ON public.ai_agents FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- AGENT_TRAININGS
CREATE POLICY agent_trainings_org_isolation
  ON public.agent_trainings FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- CADENCE_VARIANTS
CREATE POLICY cadence_variants_org_isolation
  ON public.cadence_variants FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- LOST_REASONS
CREATE POLICY lost_reasons_org_isolation
  ON public.lost_reasons FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- QUALIFICATION_ANSWERS
CREATE POLICY qualification_answers_org_isolation
  ON public.qualification_answers FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- APP_SETTINGS
CREATE POLICY app_settings_org_isolation
  ON public.app_settings FOR ALL
  TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

-- PROFILES — usuários veem perfis da mesma org
CREATE POLICY profiles_org_visibility
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));
