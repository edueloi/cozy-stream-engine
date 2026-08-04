-- 1) Restrict ai_agents SELECT to managers only
DROP POLICY IF EXISTS ai_agents_select_authenticated ON public.ai_agents;
CREATE POLICY ai_agents_select_managers
ON public.ai_agents
FOR SELECT
TO authenticated
USING (public.is_manager(auth.uid()));

-- 2) Tighten messages INSERT: non-managers must own the lead
DROP POLICY IF EXISTS "messages team insert" ON public.messages;
CREATE POLICY messages_team_insert
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_manager(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = messages.lead_id
      AND l.owner_id = auth.uid()
  )
);
