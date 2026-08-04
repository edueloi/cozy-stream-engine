
-- Phase 1: Inbound module schema (additive, non-breaking)

-- 1) Extend lead_status enum
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'inbound_new';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'inbound_in_progress';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'inbound_qualified';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'support_requested';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'finance_requested';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'needs_human';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'human_assigned';
ALTER TYPE public.lead_status ADD VALUE IF NOT EXISTS 'inbound_closed';

-- 2) leads: add inbound-specific columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lifecycle_stage text,
  ADD COLUMN IF NOT EXISTS is_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inbound_interactions_count integer NOT NULL DEFAULT 0;

-- 3) messages: origin marker for UI filters
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS conversation_origin text NOT NULL DEFAULT 'cadence';

-- 4) ai_agents: normalize agent_type value set (text column, no CHECK)
UPDATE public.ai_agents SET agent_type = 'outbound_sdr'
  WHERE agent_type IS NULL OR agent_type IN ('SDR','sdr','followup');

-- 5) app_settings: inbound configuration
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS inbound_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inbound_default_agent_id uuid,
  ADD COLUMN IF NOT EXISTS inbound_business_hours_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inbound_after_hours_message text
    DEFAULT 'Olá! Recebemos sua mensagem. Nosso atendimento humano funciona em horário comercial, mas posso adiantar algumas informações para ajudar.',
  ADD COLUMN IF NOT EXISTS inbound_handoff_user_id uuid,
  ADD COLUMN IF NOT EXISTS inbound_create_lead_automatically boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inbound_pause_cadence_on_message boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inbound_support_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_inbound_interactions integer NOT NULL DEFAULT 25;

-- FKs (best-effort, ignore if targets not present)
DO $$ BEGIN
  ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_inbound_default_agent_fk
    FOREIGN KEY (inbound_default_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_inbound_handoff_user_fk
    FOREIGN KEY (inbound_handoff_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_messages_origin ON public.messages(organization_id, conversation_origin);
CREATE INDEX IF NOT EXISTS idx_leads_status_org ON public.leads(organization_id, status);
