
-- Helper: gestor (superadmin/admin/gerente)
CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin','admin','gerente')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated, service_role;

-- Promove usuário atual a superadmin
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'superadmin'::app_role FROM public.user_roles WHERE role = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;

-- handle_new_user: primeiro = superadmin, demais = sdr (vendedor)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  IF (SELECT count(*) FROM public.profiles) = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'superadmin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'sdr') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- Trigger para carimbar owner_id em leads
CREATE OR REPLACE FUNCTION public.set_lead_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_set_lead_owner ON public.leads;
CREATE TRIGGER trg_set_lead_owner BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_lead_owner();

-- ============ LEADS ============
DROP POLICY IF EXISTS "leads team read" ON public.leads;
DROP POLICY IF EXISTS "leads team write" ON public.leads;
DROP POLICY IF EXISTS "leads team update" ON public.leads;
DROP POLICY IF EXISTS "leads team delete" ON public.leads;
DROP POLICY IF EXISTS "leads_select_auth" ON public.leads;
DROP POLICY IF EXISTS "leads_insert_sdr" ON public.leads;
DROP POLICY IF EXISTS "leads_update_sdr" ON public.leads;
DROP POLICY IF EXISTS "leads_delete_admin" ON public.leads;

CREATE POLICY "leads_select_scoped" ON public.leads FOR SELECT TO authenticated
USING (public.is_manager(auth.uid()) OR owner_id = auth.uid());
CREATE POLICY "leads_insert_scoped" ON public.leads FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['superadmin','admin','gerente','sdr','comercial']::app_role[])
  AND (owner_id IS NULL OR owner_id = auth.uid() OR public.is_manager(auth.uid()))
);
CREATE POLICY "leads_update_scoped" ON public.leads FOR UPDATE TO authenticated
USING (public.is_manager(auth.uid()) OR owner_id = auth.uid())
WITH CHECK (public.is_manager(auth.uid()) OR owner_id = auth.uid());
CREATE POLICY "leads_delete_scoped" ON public.leads FOR DELETE TO authenticated
USING (public.is_manager(auth.uid()));

-- ============ MESSAGES ============
DROP POLICY IF EXISTS "messages team read" ON public.messages;
DROP POLICY IF EXISTS "messages team write" ON public.messages;
DROP POLICY IF EXISTS "messages team update" ON public.messages;
DROP POLICY IF EXISTS "messages team delete" ON public.messages;
DROP POLICY IF EXISTS "messages_select_auth" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_auth" ON public.messages;
DROP POLICY IF EXISTS "messages_update_auth" ON public.messages;

CREATE POLICY "messages_scoped_select" ON public.messages FOR SELECT TO authenticated
USING (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = messages.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "messages_scoped_insert" ON public.messages FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = messages.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "messages_scoped_update" ON public.messages FOR UPDATE TO authenticated
USING (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = messages.lead_id AND l.owner_id = auth.uid()
))
WITH CHECK (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = messages.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "messages_scoped_delete" ON public.messages FOR DELETE TO authenticated
USING (public.is_manager(auth.uid()));

-- ============ CALLS ============
DROP POLICY IF EXISTS "calls team read" ON public.calls;
DROP POLICY IF EXISTS "calls team insert" ON public.calls;
DROP POLICY IF EXISTS "calls team update" ON public.calls;
DROP POLICY IF EXISTS "calls team delete" ON public.calls;
DROP POLICY IF EXISTS "calls_select_auth" ON public.calls;
DROP POLICY IF EXISTS "calls_insert_auth" ON public.calls;

CREATE POLICY "calls_scoped_select" ON public.calls FOR SELECT TO authenticated
USING (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = calls.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "calls_scoped_insert" ON public.calls FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = calls.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "calls_scoped_update" ON public.calls FOR UPDATE TO authenticated
USING (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = calls.lead_id AND l.owner_id = auth.uid()
))
WITH CHECK (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = calls.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "calls_scoped_delete" ON public.calls FOR DELETE TO authenticated
USING (public.is_manager(auth.uid()));

-- ============ ACTIVITY EVENTS ============
DROP POLICY IF EXISTS "activity team read" ON public.activity_events;
DROP POLICY IF EXISTS "activity team insert" ON public.activity_events;
DROP POLICY IF EXISTS "activity team delete" ON public.activity_events;
DROP POLICY IF EXISTS "activity_select_auth" ON public.activity_events;
DROP POLICY IF EXISTS "activity_insert_auth" ON public.activity_events;

CREATE POLICY "activity_scoped_select" ON public.activity_events FOR SELECT TO authenticated
USING (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "activity_scoped_insert" ON public.activity_events FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()) OR EXISTS (
  SELECT 1 FROM public.leads l WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()
));
CREATE POLICY "activity_scoped_delete" ON public.activity_events FOR DELETE TO authenticated
USING (public.is_manager(auth.uid()));

-- ============ QUALIFICATION ANSWERS ============
DO $$ BEGIN
  PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='qualification_answers' AND column_name='lead_id';
  IF FOUND THEN
    EXECUTE 'DROP POLICY IF EXISTS "qa_select_auth" ON public.qualification_answers';
    EXECUTE 'DROP POLICY IF EXISTS "qa_insert_auth" ON public.qualification_answers';
    EXECUTE 'DROP POLICY IF EXISTS "qa team read" ON public.qualification_answers';
    EXECUTE 'DROP POLICY IF EXISTS "qa team write" ON public.qualification_answers';
    EXECUTE $p$CREATE POLICY "qa_scoped_select" ON public.qualification_answers FOR SELECT TO authenticated
      USING (public.is_manager(auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = qualification_answers.lead_id AND l.owner_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "qa_scoped_insert" ON public.qualification_answers FOR INSERT TO authenticated
      WITH CHECK (public.is_manager(auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = qualification_answers.lead_id AND l.owner_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "qa_scoped_update" ON public.qualification_answers FOR UPDATE TO authenticated
      USING (public.is_manager(auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = qualification_answers.lead_id AND l.owner_id = auth.uid()))
      WITH CHECK (public.is_manager(auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = qualification_answers.lead_id AND l.owner_id = auth.uid()))$p$;
    EXECUTE $p$CREATE POLICY "qa_scoped_delete" ON public.qualification_answers FOR DELETE TO authenticated
      USING (public.is_manager(auth.uid()))$p$;
  END IF;
END $$;

-- ============ PROFILES ============
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
CREATE POLICY "profiles_select_scoped" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_manager(auth.uid()));

-- ============ USER ROLES (gerenciamento) ============
DROP POLICY IF EXISTS "user_roles_select_self" ON public.user_roles;
DROP POLICY IF EXISTS "ur_manage" ON public.user_roles;
CREATE POLICY "ur_select" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_manager(auth.uid()));
CREATE POLICY "ur_insert" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "ur_update" ON public.user_roles FOR UPDATE TO authenticated
USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "ur_delete" ON public.user_roles FOR DELETE TO authenticated
USING (public.is_manager(auth.uid()));
