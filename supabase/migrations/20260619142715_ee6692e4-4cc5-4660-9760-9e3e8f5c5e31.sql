DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;
CREATE POLICY profiles_select_scoped
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.is_superadmin(auth.uid())
  OR (
    public.is_manager(auth.uid())
    AND organization_id = public.current_org_id()
  )
);

DROP POLICY IF EXISTS ur_select ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_scoped
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin(auth.uid())
  OR (
    public.is_manager(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.organization_id = public.current_org_id()
    )
  )
);

DROP POLICY IF EXISTS ur_insert ON public.user_roles;
CREATE POLICY user_roles_insert_scoped
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (
    public.is_manager(auth.uid())
    AND role <> 'superadmin'::public.app_role
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.organization_id = public.current_org_id()
    )
  )
);

DROP POLICY IF EXISTS ur_update ON public.user_roles;
CREATE POLICY user_roles_update_scoped
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    public.is_manager(auth.uid())
    AND role <> 'superadmin'::public.app_role
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.organization_id = public.current_org_id()
    )
  )
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR (
    public.is_manager(auth.uid())
    AND role <> 'superadmin'::public.app_role
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.organization_id = public.current_org_id()
    )
  )
);

DROP POLICY IF EXISTS ur_delete ON public.user_roles;
CREATE POLICY user_roles_delete_scoped
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR (
    public.is_manager(auth.uid())
    AND role <> 'superadmin'::public.app_role
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = user_roles.user_id
        AND p.organization_id = public.current_org_id()
    )
  )
);