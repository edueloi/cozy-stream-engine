-- Tenant Provider Center: aditivo, sem quebrar dados existentes

-- 1) Feature flag por organização
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS tenant_provider_settings_enabled boolean NOT NULL DEFAULT false;

-- 2) provider_capabilities: distinguir "disponível" vs "adapter em breve"
ALTER TABLE public.provider_capabilities
  ADD COLUMN IF NOT EXISTS available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_adapter boolean NOT NULL DEFAULT false;

-- 3) provider_credentials: colunas necessárias para a Central
ALTER TABLE public.provider_credentials
  ADD COLUMN IF NOT EXISTS last4 text,
  ADD COLUMN IF NOT EXISTS base_url text,
  ADD COLUMN IF NOT EXISTS timeout_ms integer,
  ADD COLUMN IF NOT EXISTS daily_limit integer,
  ADD COLUMN IF NOT EXISTS monthly_limit integer,
  ADD COLUMN IF NOT EXISTS max_concurrent_requests integer,
  ADD COLUMN IF NOT EXISTS requests_per_minute integer,
  ADD COLUMN IF NOT EXISTS requests_per_hour integer,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

DO $$ BEGIN
  ALTER TABLE public.provider_credentials
    ADD CONSTRAINT provider_credentials_mode_check
    CHECK (credential_mode IN ('organization','platform','disabled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS provider_credentials_org_provider_uidx
  ON public.provider_credentials(organization_id, provider);

-- Write policies restritas a superadmin/admin da org
DROP POLICY IF EXISTS "provider_credentials_insert" ON public.provider_credentials;
DROP POLICY IF EXISTS "provider_credentials_update" ON public.provider_credentials;
DROP POLICY IF EXISTS "provider_credentials_delete" ON public.provider_credentials;

CREATE POLICY "provider_credentials_insert" ON public.provider_credentials
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (organization_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin']::app_role[]))
  );

CREATE POLICY "provider_credentials_update" ON public.provider_credentials
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (organization_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin']::app_role[]))
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (organization_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin']::app_role[]))
  );

CREATE POLICY "provider_credentials_delete" ON public.provider_credentials
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (organization_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin']::app_role[]))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_credentials TO authenticated;
GRANT ALL ON public.provider_credentials TO service_role;

-- 4) Vault: server-only, sem acesso para authenticated/anon
CREATE TABLE IF NOT EXISTS public.provider_secret_vault (
  reference text PRIMARY KEY,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.provider_secret_vault TO service_role;
-- intencionalmente NENHUM grant para authenticated/anon

ALTER TABLE public.provider_secret_vault ENABLE ROW LEVEL SECURITY;
-- nenhuma policy → nega tudo para authenticated/anon; service_role bypassa RLS

DROP TRIGGER IF EXISTS provider_secret_vault_touch ON public.provider_secret_vault;
CREATE TRIGGER provider_secret_vault_touch
  BEFORE UPDATE ON public.provider_secret_vault
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Auditoria
CREATE TABLE IF NOT EXISTS public.provider_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  action text NOT NULL,
  result text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_audit_log_org_idx
  ON public.provider_audit_log(organization_id, created_at DESC);

GRANT SELECT ON public.provider_audit_log TO authenticated;
GRANT ALL ON public.provider_audit_log TO service_role;

ALTER TABLE public.provider_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_audit_log_select" ON public.provider_audit_log;
CREATE POLICY "provider_audit_log_select" ON public.provider_audit_log
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (organization_id = public.current_org_id() AND public.has_any_role(auth.uid(), ARRAY['admin','gerente']::app_role[]))
  );

-- 6) Ativar flag apenas para a organização JCS
UPDATE public.app_settings s
   SET tenant_provider_settings_enabled = true
  FROM public.organizations o
 WHERE s.organization_id = o.id AND o.slug = 'jcs';
