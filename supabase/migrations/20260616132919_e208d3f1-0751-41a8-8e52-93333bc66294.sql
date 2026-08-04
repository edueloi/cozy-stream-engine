
DO $$ BEGIN CREATE TYPE public.lead_status AS ENUM ('coletado','enriquecido','em_cadencia','qualificado','reuniao','convertido','descartado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_channel AS ENUM ('whatsapp','email','voice'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_direction AS ENUM ('outbound','inbound'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.message_status AS ENUM ('pending','sent','failed','delivered','received'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.lead_intent AS ENUM ('interessado','pediu_info','objecao','desinteresse','agendar'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- app_settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  id int PRIMARY KEY DEFAULT 1,
  agent_name text DEFAULT 'Assistente JCS',
  agent_personality text DEFAULT 'Consultivo, direto e cordial.',
  agent_product text DEFAULT '',
  agent_objections text DEFAULT '',
  icp_segmentos text[] DEFAULT '{}',
  icp_cidades text[] DEFAULT '{}',
  whatsapp_instance_url text DEFAULT '',
  whatsapp_instance_name text DEFAULT '',
  whatsapp_api_key text DEFAULT '',
  smtp_host text DEFAULT '',
  smtp_port int DEFAULT 587,
  smtp_user text DEFAULT '',
  smtp_pass text DEFAULT '',
  smtp_from_email text DEFAULT '',
  smtp_from_name text DEFAULT '',
  apify_token text DEFAULT '',
  apify_actor_id text DEFAULT '',
  twilio_from_number text DEFAULT '',
  booking_link text DEFAULT '',
  llm_model text DEFAULT 'google/gemini-2.5-flash',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_check CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings select auth" ON public.app_settings;
CREATE POLICY "settings select auth" ON public.app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "settings insert admin" ON public.app_settings;
CREATE POLICY "settings insert admin" ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]));
DROP POLICY IF EXISTS "settings update admin" ON public.app_settings;
CREATE POLICY "settings update admin" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]));
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
DROP TRIGGER IF EXISTS trg_app_settings_updated ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text,
  nome_fantasia text,
  cnpj text,
  cnae text,
  segmento text,
  cidade text,
  estado text,
  site text,
  telefone text,
  whatsapp text,
  email text,
  funcionarios_estimado int,
  faturamento_estimado numeric,
  tecnologias jsonb DEFAULT '[]'::jsonb,
  redes_sociais jsonb DEFAULT '{}'::jsonb,
  decisores jsonb DEFAULT '[]'::jsonb,
  dores jsonb DEFAULT '[]'::jsonb,
  oportunidades jsonb DEFAULT '[]'::jsonb,
  score numeric NOT NULL DEFAULT 0,
  engagement_score numeric NOT NULL DEFAULT 0,
  status public.lead_status NOT NULL DEFAULT 'coletado',
  intent_last public.lead_intent,
  cadence_day int NOT NULL DEFAULT 0,
  cadence_paused boolean NOT NULL DEFAULT false,
  last_inbound_at timestamptz,
  meeting_scheduled_at timestamptz,
  source text,
  source_raw jsonb,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_cidade ON public.leads(cidade);
CREATE INDEX IF NOT EXISTS idx_leads_segmento ON public.leads(segmento);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads all auth" ON public.leads;
CREATE POLICY "leads all auth" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS trg_leads_updated ON public.leads;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel public.message_channel NOT NULL,
  direction public.message_direction NOT NULL,
  subject text,
  body text,
  generated_by_ai boolean NOT NULL DEFAULT false,
  llm_model text,
  status public.message_status NOT NULL DEFAULT 'pending',
  intent public.lead_intent,
  error_detail text,
  external_id text,
  raw_response jsonb,
  cadence_day int,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON public.messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_inbound_unread ON public.messages(direction, read_at) WHERE direction = 'inbound' AND read_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages all auth" ON public.messages;
CREATE POLICY "messages all auth" ON public.messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- calls
CREATE TABLE IF NOT EXISTS public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  twilio_call_sid text UNIQUE,
  status text,
  duration_sec int,
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calls_lead ON public.calls(lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calls all auth" ON public.calls;
CREATE POLICY "calls all auth" ON public.calls FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- activity_events
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_lead ON public.activity_events(lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activity all auth" ON public.activity_events;
CREATE POLICY "activity all auth" ON public.activity_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
