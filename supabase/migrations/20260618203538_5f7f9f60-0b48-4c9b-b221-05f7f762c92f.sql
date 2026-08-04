
CREATE TABLE public.conversation_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  conversation_id UUID,
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  message_ids UUID[] DEFAULT '{}',
  opening_score NUMERIC,
  investigation_score NUMERIC,
  objection_handling_score NUMERIC,
  value_proposition_score NUMERIC,
  commitment_score NUMERIC,
  behavior_score NUMERIC,
  overall_score NUMERIC,
  strengths TEXT[],
  weaknesses TEXT[],
  improvement_suggestions TEXT[],
  detected_objections TEXT[],
  detected_intent TEXT,
  lead_temperature TEXT,
  recommended_next_action TEXT,
  human_feedback TEXT,
  human_feedback_reason TEXT,
  human_feedback_by UUID,
  human_feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_eval_org ON public.conversation_evaluations(organization_id);
CREATE INDEX idx_conv_eval_agent ON public.conversation_evaluations(agent_id);
CREATE INDEX idx_conv_eval_lead ON public.conversation_evaluations(lead_id);
CREATE INDEX idx_conv_eval_channel ON public.conversation_evaluations(channel);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_evaluations TO authenticated;
GRANT ALL ON public.conversation_evaluations TO service_role;

ALTER TABLE public.conversation_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read evaluations"
  ON public.conversation_evaluations FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

CREATE POLICY "org members write evaluations"
  ON public.conversation_evaluations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "org members update evaluations"
  ON public.conversation_evaluations FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "org members delete evaluations"
  ON public.conversation_evaluations FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE TRIGGER trg_conv_eval_updated_at
  BEFORE UPDATE ON public.conversation_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_conv_eval_set_org
  BEFORE INSERT ON public.conversation_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();


CREATE TABLE public.agent_optimization_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,
  suggestion_text TEXT NOT NULL,
  rationale TEXT,
  based_on_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  applied_by UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_opt_org ON public.agent_optimization_suggestions(organization_id);
CREATE INDEX idx_agent_opt_agent ON public.agent_optimization_suggestions(agent_id);
CREATE INDEX idx_agent_opt_status ON public.agent_optimization_suggestions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_optimization_suggestions TO authenticated;
GRANT ALL ON public.agent_optimization_suggestions TO service_role;

ALTER TABLE public.agent_optimization_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read agent optimizations"
  ON public.agent_optimization_suggestions FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

CREATE POLICY "managers write agent optimizations"
  ON public.agent_optimization_suggestions FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "managers update agent optimizations"
  ON public.agent_optimization_suggestions FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "managers delete agent optimizations"
  ON public.agent_optimization_suggestions FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE TRIGGER trg_agent_opt_updated_at
  BEFORE UPDATE ON public.agent_optimization_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_agent_opt_set_org
  BEFORE INSERT ON public.agent_optimization_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
