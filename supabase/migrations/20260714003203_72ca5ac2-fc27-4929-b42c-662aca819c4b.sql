
DROP POLICY "org members update evaluations" ON public.conversation_evaluations;
CREATE POLICY "org members update evaluations" ON public.conversation_evaluations
  FOR UPDATE
  USING (organization_id = current_org_id() AND is_manager(auth.uid()))
  WITH CHECK (organization_id = current_org_id() AND is_manager(auth.uid()));

DROP POLICY "meetings_v2_org_select" ON public.meetings_v2;
CREATE POLICY "meetings_v2_org_select" ON public.meetings_v2
  FOR SELECT
  USING (organization_id = current_org_id() AND (owner_user_id = auth.uid() OR is_manager(auth.uid())));
