CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  campaign_goal text DEFAULT '',
  personality text DEFAULT '',
  product text DEFAULT '',
  training_notes text DEFAULT '',
  objections text DEFAULT '',
  llm_model text DEFAULT 'google/gemini-3-flash-preview',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_agents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_agents_select_authenticated"
ON public.ai_agents
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "ai_agents_insert_managers"
ON public.ai_agents
FOR INSERT
TO authenticated
WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "ai_agents_update_managers"
ON public.ai_agents
FOR UPDATE
TO authenticated
USING (public.is_manager(auth.uid()))
WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "ai_agents_delete_managers"
ON public.ai_agents
FOR DELETE
TO authenticated
USING (public.is_manager(auth.uid()));

CREATE TRIGGER set_ai_agents_updated_at
BEFORE UPDATE ON public.ai_agents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON public.leads(agent_id);

INSERT INTO public.ai_agents (name, description, campaign_goal, personality, product, training_notes, objections, llm_model, active)
SELECT
  COALESCE(agent_name, 'Agente SDR'),
  'Agente padrão migrado das configurações',
  'Rodar campanhas e cadências outbound',
  COALESCE(agent_personality, ''),
  COALESCE(agent_product, ''),
  '',
  COALESCE(agent_objections, ''),
  COALESCE(llm_model, 'google/gemini-3-flash-preview'),
  true
FROM public.app_settings
WHERE id = 1
  AND NOT EXISTS (SELECT 1 FROM public.ai_agents);
