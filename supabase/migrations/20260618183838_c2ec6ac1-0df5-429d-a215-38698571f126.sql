
-- =========================================
-- ETAPA 1 — Núcleo Multi-Tenant SaaS
-- Reversível: DROP TABLE payments, billing_history, subscriptions, organization_plans, organizations CASCADE;
-- =========================================

-- 1) ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  favicon_url text,
  primary_color text DEFAULT '#2563eb',
  secondary_color text DEFAULT '#0ea5e9',
  plan text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active', -- active | trial | suspended | cancelled
  trial_ends_at timestamptz,
  custom_domain text,
  footer_text text,
  email_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: superadmin?
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin'
  )
$$;

-- Policies organizations: superadmin total; demais autenticados leem todas (org_id ainda não existe em profiles)
-- Em etapa 2 será endurecido para ler somente a própria org.
CREATE POLICY organizations_select_all_auth
  ON public.organizations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY organizations_superadmin_all
  ON public.organizations FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- 2) ORGANIZATION_PLANS
CREATE TABLE public.organization_plans (
  code text PRIMARY KEY,
  name text NOT NULL,
  limite_usuarios integer NOT NULL DEFAULT 0,
  limite_leads integer NOT NULL DEFAULT 0,
  limite_agentes integer NOT NULL DEFAULT 0,
  limite_mensagens integer NOT NULL DEFAULT 0,
  limite_ligacoes integer NOT NULL DEFAULT 0,
  limite_importacoes integer NOT NULL DEFAULT 0,
  monthly_price_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.organization_plans TO authenticated;
GRANT ALL ON public.organization_plans TO service_role;

ALTER TABLE public.organization_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select_auth
  ON public.organization_plans FOR SELECT
  TO authenticated USING (true);

CREATE POLICY plans_superadmin_write
  ON public.organization_plans FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER trg_plans_updated_at
BEFORE UPDATE ON public.organization_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.organization_plans (code, name, limite_usuarios, limite_leads, limite_agentes, limite_mensagens, limite_ligacoes, limite_importacoes, monthly_price_cents) VALUES
  ('starter',      'Starter',      3,  1000,   2,  5000,   500,  5,   9900),
  ('professional', 'Professional', 10, 10000,  10, 50000,  5000, 50,  29900),
  ('enterprise',   'Enterprise',   100,1000000,100,1000000,100000,1000,99900);

-- 3) Seed JCS Soluções como organização padrão
INSERT INTO public.organizations (name, slug, plan, status)
VALUES ('JCS Soluções', 'jcs', 'enterprise', 'active');

-- 4) SUBSCRIPTIONS
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.organization_plans(code),
  status text NOT NULL DEFAULT 'active', -- active | trial | past_due | cancelled
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at timestamptz,
  external_id text,
  provider text, -- stripe | paddle | manual
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY subscriptions_superadmin_all
  ON public.subscriptions FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- (policies de membro virão na etapa 2 quando profiles.organization_id existir)

-- 5) BILLING_HISTORY
CREATE TABLE public.billing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded
  period_start timestamptz,
  period_end timestamptz,
  invoice_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_history TO authenticated;
GRANT ALL ON public.billing_history TO service_role;
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_billing_history_updated_at
BEFORE UPDATE ON public.billing_history
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY billing_history_superadmin_all
  ON public.billing_history FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- 6) PAYMENTS
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  billing_history_id uuid REFERENCES public.billing_history(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending', -- pending | succeeded | failed | refunded
  provider text,
  external_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY payments_superadmin_all
  ON public.payments FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

-- Cria subscription enterprise para JCS
INSERT INTO public.subscriptions (organization_id, plan_code, status)
SELECT id, 'enterprise', 'active' FROM public.organizations WHERE slug = 'jcs';
