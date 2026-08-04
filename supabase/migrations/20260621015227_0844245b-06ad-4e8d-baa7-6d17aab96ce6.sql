
-- 1) app_settings: restrict to managers only (contains credentials)
DROP POLICY IF EXISTS app_settings_org_isolation ON public.app_settings;
CREATE POLICY app_settings_managers_all
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (
    (public.is_manager(auth.uid()) AND organization_id = public.current_org_id())
    OR public.is_superadmin(auth.uid())
  )
  WITH CHECK (
    (public.is_manager(auth.uid()) AND organization_id = public.current_org_id())
    OR public.is_superadmin(auth.uid())
  );

-- 2) activity_events: split policies — manager or owner of related lead
DROP POLICY IF EXISTS activity_events_org_isolation ON public.activity_events;

CREATE POLICY activity_events_select_scoped
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      organization_id = public.current_org_id()
      AND (
        public.is_manager(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY activity_events_insert_scoped
  ON public.activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      organization_id = public.current_org_id()
      AND (
        public.is_manager(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY activity_events_update_scoped
  ON public.activity_events
  FOR UPDATE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      organization_id = public.current_org_id()
      AND (
        public.is_manager(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      organization_id = public.current_org_id()
      AND (
        public.is_manager(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY activity_events_delete_scoped
  ON public.activity_events
  FOR DELETE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      organization_id = public.current_org_id()
      AND (
        public.is_manager(auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()
        )
      )
    )
  );

-- 3) user_roles: prevent privilege escalation
-- Non-superadmin managers can only manage roles strictly below 'gerente' (e.g. 'sdr', 'comercial'),
-- and cannot modify their own user_roles row.
DROP POLICY IF EXISTS user_roles_insert_scoped ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update_scoped ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_scoped ON public.user_roles;

CREATE POLICY user_roles_insert_scoped
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND user_id <> auth.uid()
      AND role NOT IN ('superadmin','admin','gerente')
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id AND p.organization_id = public.current_org_id()
      )
    )
  );

CREATE POLICY user_roles_update_scoped
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND user_id <> auth.uid()
      AND role NOT IN ('superadmin','admin','gerente')
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id AND p.organization_id = public.current_org_id()
      )
    )
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND user_id <> auth.uid()
      AND role NOT IN ('superadmin','admin','gerente')
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id AND p.organization_id = public.current_org_id()
      )
    )
  );

CREATE POLICY user_roles_delete_scoped
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND user_id <> auth.uid()
      AND role NOT IN ('superadmin','admin','gerente')
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id AND p.organization_id = public.current_org_id()
      )
    )
  );

-- 4) Realtime: scope topic subscriptions by organization
DROP POLICY IF EXISTS realtime_messages_managers_select ON realtime.messages;
CREATE POLICY realtime_messages_org_scoped_select
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND realtime.topic() LIKE 'org:' || public.current_org_id()::text || ':%'
    )
  );
