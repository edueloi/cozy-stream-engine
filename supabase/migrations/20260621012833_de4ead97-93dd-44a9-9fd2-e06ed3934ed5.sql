
-- Fix 1: restrict activity_events policy to authenticated role
DROP POLICY IF EXISTS activity_events_org_isolation ON public.activity_events;
CREATE POLICY activity_events_org_isolation ON public.activity_events
  AS PERMISSIVE FOR ALL
  TO authenticated
  USING ((organization_id = public.current_org_id()) OR public.is_superadmin(auth.uid()))
  WITH CHECK ((organization_id = public.current_org_id()) OR public.is_superadmin(auth.uid()));

-- Fix 2: prevent role escalation - only superadmin can assign admin/superadmin
DROP POLICY IF EXISTS user_roles_insert_scoped ON public.user_roles;
CREATE POLICY user_roles_insert_scoped ON public.user_roles
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND role NOT IN ('superadmin'::public.app_role, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id
          AND p.organization_id = public.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS user_roles_update_scoped ON public.user_roles;
CREATE POLICY user_roles_update_scoped ON public.user_roles
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND role NOT IN ('superadmin'::public.app_role, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id
          AND p.organization_id = public.current_org_id()
      )
    )
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND role NOT IN ('superadmin'::public.app_role, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id
          AND p.organization_id = public.current_org_id()
      )
    )
  );

DROP POLICY IF EXISTS user_roles_delete_scoped ON public.user_roles;
CREATE POLICY user_roles_delete_scoped ON public.user_roles
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_manager(auth.uid())
      AND role NOT IN ('superadmin'::public.app_role, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_roles.user_id
          AND p.organization_id = public.current_org_id()
      )
    )
  );
