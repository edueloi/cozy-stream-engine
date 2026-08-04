
DROP POLICY IF EXISTS provider_credentials_select ON public.provider_credentials;
CREATE POLICY provider_credentials_select ON public.provider_credentials
  FOR SELECT TO authenticated
  USING (
    is_superadmin(auth.uid())
    OR (
      organization_id IS NOT NULL
      AND organization_id = current_org_id()
      AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'gerente'::app_role])
    )
  );
