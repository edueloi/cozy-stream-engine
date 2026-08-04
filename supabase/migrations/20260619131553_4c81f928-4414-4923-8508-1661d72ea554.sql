
-- activity_events: replace permissive ALL policy with scoped CRUD; add UPDATE policy
DROP POLICY IF EXISTS activity_events_org_isolation ON public.activity_events;
CREATE POLICY activity_scoped_update ON public.activity_events
  FOR UPDATE TO authenticated
  USING (is_manager(auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()) OR is_superadmin(auth.uid()))
  WITH CHECK (is_manager(auth.uid()) OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = activity_events.lead_id AND l.owner_id = auth.uid()) OR is_superadmin(auth.uid()));

-- cadence_variants: scope read to same org
DROP POLICY IF EXISTS "cv read" ON public.cadence_variants;
CREATE POLICY "cv read" ON public.cadence_variants
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_superadmin(auth.uid()));

-- lost_reasons: scope read to same org
DROP POLICY IF EXISTS "lost read" ON public.lost_reasons;
CREATE POLICY "lost read" ON public.lost_reasons
  FOR SELECT TO authenticated
  USING (organization_id = current_org_id() OR is_superadmin(auth.uid()));

-- profiles: drop org-wide visibility; keep self + manager
DROP POLICY IF EXISTS profiles_org_visibility ON public.profiles;

-- user_roles: prevent privilege escalation - only superadmins may insert/update superadmin role
DROP POLICY IF EXISTS ur_insert ON public.user_roles;
CREATE POLICY ur_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    is_superadmin(auth.uid())
    OR (is_manager(auth.uid()) AND role <> 'superadmin'::app_role AND role <> 'admin'::app_role)
  );

DROP POLICY IF EXISTS ur_update ON public.user_roles;
CREATE POLICY ur_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (is_manager(auth.uid()))
  WITH CHECK (
    is_superadmin(auth.uid())
    OR (is_manager(auth.uid()) AND role <> 'superadmin'::app_role AND role <> 'admin'::app_role)
  );

DROP POLICY IF EXISTS ur_delete ON public.user_roles;
CREATE POLICY ur_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    is_superadmin(auth.uid())
    OR (is_manager(auth.uid()) AND role <> 'superadmin'::app_role AND role <> 'admin'::app_role)
  );
