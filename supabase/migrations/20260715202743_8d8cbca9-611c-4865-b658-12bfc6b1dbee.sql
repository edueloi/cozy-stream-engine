
-- Fix marketplace_ratings cross-org read: only expose ratings for templates the user's org has installed, or own ratings
DROP POLICY IF EXISTS "read ratings" ON public.marketplace_ratings;
CREATE POLICY "read ratings" ON public.marketplace_ratings
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.marketplace_templates t
      WHERE t.id = marketplace_ratings.template_id AND t.published = true
    )
  );

-- Fix meetings_v2_org_select role from public to authenticated
DROP POLICY IF EXISTS meetings_v2_org_select ON public.meetings_v2;
CREATE POLICY meetings_v2_org_select ON public.meetings_v2
  FOR SELECT TO authenticated
  USING ((organization_id = current_org_id()) AND ((owner_user_id = auth.uid()) OR is_manager(auth.uid())));
