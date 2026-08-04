
-- Expand ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS role_title text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS communication_style text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS llm_provider text DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS context_multiplier int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS response_delay_seconds int DEFAULT 5,
  ADD COLUMN IF NOT EXISTS interaction_limit int DEFAULT 50,
  ADD COLUMN IF NOT EXISTS limit_action text DEFAULT 'block_5m',
  ADD COLUMN IF NOT EXISTS allow_emojis boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sign_responses boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS restrict_topics boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS split_messages boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_reminders boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS smart_training_search boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_to_human boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS transfer_summary boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS business_hours jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inactivity_actions jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS webhooks jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transfer_rules jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS intents jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS channels jsonb DEFAULT '[]'::jsonb;

-- Trainings table
CREATE TABLE IF NOT EXISTS public.agent_trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text','website','document','video','audio')),
  title text,
  content text,
  url text,
  storage_path text,
  status text NOT NULL DEFAULT 'ready',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_trainings TO authenticated;
GRANT ALL ON public.agent_trainings TO service_role;

ALTER TABLE public.agent_trainings ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_trainings_select ON public.agent_trainings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY agent_trainings_modify ON public.agent_trainings
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE TRIGGER set_agent_trainings_updated_at
  BEFORE UPDATE ON public.agent_trainings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
