
DROP POLICY IF EXISTS "Authenticated can view agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Authenticated users can view agents" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents_select" ON public.ai_agents;

CREATE POLICY "Managers can view agents"
  ON public.ai_agents FOR SELECT
  TO authenticated
  USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can view trainings" ON public.agent_trainings;
DROP POLICY IF EXISTS "Authenticated users can view trainings" ON public.agent_trainings;
DROP POLICY IF EXISTS "agent_trainings_select" ON public.agent_trainings;

CREATE POLICY "Managers can view trainings"
  ON public.agent_trainings FOR SELECT
  TO authenticated
  USING (public.is_manager(auth.uid()));
