
-- Extend plans
ALTER TABLE public.organization_plans
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS price_yearly_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_calls_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_ai_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apify_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orbit_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS white_label_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advanced_analytics_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- RLS for organization_plans (readable by everyone authenticated; only superadmin writes)
ALTER TABLE public.organization_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans readable" ON public.organization_plans;
CREATE POLICY "plans readable" ON public.organization_plans
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "plans superadmin manage" ON public.organization_plans;
CREATE POLICY "plans superadmin manage" ON public.organization_plans
  FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

GRANT SELECT ON public.organization_plans TO authenticated;
GRANT ALL ON public.organization_plans TO service_role;

-- Extend subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS external_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS external_payment_provider TEXT;

-- Usage counters
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  users_count INTEGER NOT NULL DEFAULT 0,
  leads_count INTEGER NOT NULL DEFAULT 0,
  agents_count INTEGER NOT NULL DEFAULT 0,
  cadences_count INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  calls_made INTEGER NOT NULL DEFAULT 0,
  apify_runs INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_org ON public.usage_counters(organization_id);

GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage org read" ON public.usage_counters;
CREATE POLICY "usage org read" ON public.usage_counters
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_usage_updated_at
  BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper RPC: get_or_create monthly usage row, increment counters
CREATE OR REPLACE FUNCTION public.usage_increment(_org UUID, _field TEXT, _by INTEGER DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period DATE := date_trunc('month', now())::date;
BEGIN
  INSERT INTO public.usage_counters(organization_id, period_month)
  VALUES (_org, _period)
  ON CONFLICT (organization_id, period_month) DO NOTHING;

  EXECUTE format('UPDATE public.usage_counters SET %I = %I + $1, updated_at = now() WHERE organization_id = $2 AND period_month = $3', _field, _field)
  USING _by, _org, _period;
END $$;

REVOKE ALL ON FUNCTION public.usage_increment(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage_increment(uuid, text, integer) TO service_role;

-- Seed plans
INSERT INTO public.organization_plans
  (code, name, description, monthly_price_cents, price_yearly_cents,
   limite_usuarios, limite_leads, limite_agentes, limite_mensagens, limite_ligacoes, limite_importacoes,
   max_calls_month, voice_ai_enabled, apify_enabled, orbit_enabled, white_label_enabled, advanced_analytics_enabled, status)
VALUES
  ('starter', 'Starter', 'Plano inicial para times pequenos', 19700, 0,
    2, 1000, 2, 2000, 0, 5, 0, false, false, false, false, false, 'active'),
  ('professional', 'Professional', 'Para times comerciais com IA de voz', 79700, 0,
    5, 10000, 10, 20000, 5000, 50, 5000, true, true, true, false, true, 'active'),
  ('enterprise', 'Enterprise', 'Recursos ilimitados e white label', 0, 0,
    -1, -1, -1, -1, -1, -1, -1, true, true, true, true, true, 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  limite_usuarios = EXCLUDED.limite_usuarios,
  limite_leads = EXCLUDED.limite_leads,
  limite_agentes = EXCLUDED.limite_agentes,
  limite_mensagens = EXCLUDED.limite_mensagens,
  limite_ligacoes = EXCLUDED.limite_ligacoes,
  limite_importacoes = EXCLUDED.limite_importacoes,
  max_calls_month = EXCLUDED.max_calls_month,
  voice_ai_enabled = EXCLUDED.voice_ai_enabled,
  apify_enabled = EXCLUDED.apify_enabled,
  orbit_enabled = EXCLUDED.orbit_enabled,
  white_label_enabled = EXCLUDED.white_label_enabled,
  advanced_analytics_enabled = EXCLUDED.advanced_analytics_enabled,
  status = EXCLUDED.status,
  updated_at = now();
