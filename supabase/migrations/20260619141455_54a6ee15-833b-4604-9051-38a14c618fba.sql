
-- Tighten RLS to enforce strict cross-tenant isolation by removing
-- permissive role-only / owner-only policies that bypass organization checks.
-- The remaining *_org_isolation policies (already in place for most tables)
-- restrict access to rows where organization_id = current_org_id() (or superadmin).

-- LEADS
DROP POLICY IF EXISTS leads_select_scoped ON public.leads;
DROP POLICY IF EXISTS leads_update_scoped ON public.leads;
DROP POLICY IF EXISTS leads_delete_scoped ON public.leads;
DROP POLICY IF EXISTS leads_insert_scoped ON public.leads;

-- MESSAGES
DROP POLICY IF EXISTS messages_scoped_select ON public.messages;
DROP POLICY IF EXISTS messages_scoped_update ON public.messages;
DROP POLICY IF EXISTS messages_scoped_delete ON public.messages;
DROP POLICY IF EXISTS messages_scoped_insert ON public.messages;
DROP POLICY IF EXISTS messages_team_insert ON public.messages;

-- CALLS
DROP POLICY IF EXISTS calls_scoped_select ON public.calls;
DROP POLICY IF EXISTS calls_scoped_update ON public.calls;
DROP POLICY IF EXISTS calls_scoped_delete ON public.calls;
DROP POLICY IF EXISTS calls_scoped_insert ON public.calls;

-- AI AGENTS
DROP POLICY IF EXISTS "Managers can view agents" ON public.ai_agents;
DROP POLICY IF EXISTS ai_agents_select_managers ON public.ai_agents;
DROP POLICY IF EXISTS ai_agents_insert_managers ON public.ai_agents;
DROP POLICY IF EXISTS ai_agents_update_managers ON public.ai_agents;
DROP POLICY IF EXISTS ai_agents_delete_managers ON public.ai_agents;

-- APP SETTINGS
DROP POLICY IF EXISTS settings_select_managers ON public.app_settings;
DROP POLICY IF EXISTS settings_insert_admin ON public.app_settings;
DROP POLICY IF EXISTS settings_update_admin ON public.app_settings;

-- AGENT TRAININGS
DROP POLICY IF EXISTS "Managers can view trainings" ON public.agent_trainings;
DROP POLICY IF EXISTS agent_trainings_modify ON public.agent_trainings;

-- CADENCE VARIANTS
DROP POLICY IF EXISTS "cv admin" ON public.cadence_variants;
DROP POLICY IF EXISTS "cv read" ON public.cadence_variants;

-- LOST REASONS
DROP POLICY IF EXISTS "lost admin" ON public.lost_reasons;

-- QUALIFICATION ANSWERS
DROP POLICY IF EXISTS qa_scoped_select ON public.qualification_answers;
DROP POLICY IF EXISTS qa_scoped_update ON public.qualification_answers;
DROP POLICY IF EXISTS qa_scoped_delete ON public.qualification_answers;
DROP POLICY IF EXISTS qa_scoped_insert ON public.qualification_answers;
DROP POLICY IF EXISTS "qa delete admin" ON public.qualification_answers;

-- ACTIVITY EVENTS — replace scoped policies with strict org isolation
DROP POLICY IF EXISTS activity_scoped_select ON public.activity_events;
DROP POLICY IF EXISTS activity_scoped_update ON public.activity_events;
DROP POLICY IF EXISTS activity_scoped_delete ON public.activity_events;
DROP POLICY IF EXISTS activity_scoped_insert ON public.activity_events;

CREATE POLICY activity_events_org_isolation ON public.activity_events
  FOR ALL
  USING ((organization_id = public.current_org_id()) OR public.is_superadmin(auth.uid()))
  WITH CHECK ((organization_id = public.current_org_id()) OR public.is_superadmin(auth.uid()));

-- Ensure inserts on org-scoped tables always carry the caller's org_id.
-- (Existing *_org_isolation policies use ALL, which already enforces this via WITH CHECK.)

-- Tighten leads INSERT/UPDATE/DELETE to require manager role within the org,
-- and SELECT/UPDATE for vendors limited to leads they own. The *_org_isolation
-- ALL policy stays as a permissive baseline; we add a RESTRICTIVE policy that
-- limits non-managers to their own leads.
CREATE POLICY leads_owner_visibility ON public.leads
  AS RESTRICTIVE
  FOR ALL
  USING (
    public.is_superadmin(auth.uid())
    OR public.is_manager(auth.uid())
    OR owner_id = auth.uid()
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR public.is_manager(auth.uid())
    OR owner_id = auth.uid()
  );
