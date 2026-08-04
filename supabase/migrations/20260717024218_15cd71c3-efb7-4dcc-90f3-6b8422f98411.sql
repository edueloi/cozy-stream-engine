DROP POLICY IF EXISTS meetings_v2_org_modify ON public.meetings_v2;
CREATE POLICY meetings_v2_org_modify ON public.meetings_v2
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (owner_user_id = auth.uid() OR public.is_manager(auth.uid()))
  );

DROP POLICY IF EXISTS meetings_v2_org_update ON public.meetings_v2;
CREATE POLICY meetings_v2_org_update ON public.meetings_v2
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_org_id()
    AND (owner_user_id = auth.uid() OR public.is_manager(auth.uid()))
  )
  WITH CHECK (
    organization_id = public.current_org_id()
    AND (owner_user_id = auth.uid() OR public.is_manager(auth.uid()))
  );