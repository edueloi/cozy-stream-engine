
CREATE TABLE public.marketplace_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_global BOOLEAN NOT NULL DEFAULT false,
  is_jcs_official BOOLEAN NOT NULL DEFAULT false,
  kind TEXT NOT NULL CHECK (kind IN ('agent','cadence','package')),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  segment TEXT,
  channel TEXT,
  author TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  tags TEXT[] NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  install_count INT NOT NULL DEFAULT 0,
  avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INT NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slug, version)
);
CREATE INDEX ON public.marketplace_templates(kind);
CREATE INDEX ON public.marketplace_templates(category);
CREATE INDEX ON public.marketplace_templates(is_global);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_templates TO authenticated;
GRANT ALL ON public.marketplace_templates TO service_role;
ALTER TABLE public.marketplace_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read templates" ON public.marketplace_templates FOR SELECT TO authenticated
  USING (is_global = true OR organization_id = public.current_org_id());
CREATE POLICY "manage own org templates" ON public.marketplace_templates FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));
CREATE POLICY "superadmin manage globals" ON public.marketplace_templates FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TABLE public.marketplace_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketplace_templates(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  installed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_installations TO authenticated;
GRANT ALL ON public.marketplace_installations TO service_role;
ALTER TABLE public.marketplace_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org reads installs" ON public.marketplace_installations FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());
CREATE POLICY "org inserts installs" ON public.marketplace_installations FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

CREATE TABLE public.marketplace_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketplace_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  stars INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_ratings TO authenticated;
GRANT ALL ON public.marketplace_ratings TO service_role;
ALTER TABLE public.marketplace_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read ratings" ON public.marketplace_ratings FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage own ratings" ON public.marketplace_ratings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.marketplace_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.marketplace_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_favorites TO authenticated;
GRANT ALL ON public.marketplace_favorites TO service_role;
ALTER TABLE public.marketplace_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manage own favs" ON public.marketplace_favorites FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_marketplace_templates_updated BEFORE UPDATE ON public.marketplace_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed JCS official templates
INSERT INTO public.marketplace_templates (is_global, is_jcs_official, kind, slug, name, description, category, segment, channel, author, payload, kpis) VALUES
(true,true,'agent','jcs-sdr-ti','SDR Gestão de TI','Gera reuniões para empresas que precisam terceirizar TI.','TI','SMB','whatsapp','JCS','{"master_prompt":"Você é SDR especialista em terceirização de TI...","rules_can":["Qualificar dor","Sugerir reunião"],"rules_cannot":["Prometer preço"]}','{"response_rate":0.35,"qualification_rate":0.18,"meeting_rate":0.08}'),
(true,true,'agent','jcs-sdr-ciberseguranca','SDR Cibersegurança','Identifica empresas vulneráveis e propõe diagnóstico.','Cibersegurança','SMB','whatsapp','JCS','{"master_prompt":"Você é SDR de cibersegurança..."}','{}'),
(true,true,'agent','jcs-sdr-backup','SDR Backup','Detecta empresas sem estratégia de backup.','Backup','SMB','email','JCS','{"master_prompt":"Você é SDR de backup..."}','{}'),
(true,true,'agent','jcs-sdr-m365','SDR Microsoft 365','Migração para Microsoft 365.','Cloud','SMB','email','JCS','{"master_prompt":"Você é SDR Microsoft 365..."}','{}'),
(true,true,'agent','jcs-sdr-firewall','SDR Firewall','Detecta empresas sem proteção adequada.','Segurança','SMB','whatsapp','JCS','{"master_prompt":"Você é SDR de firewall..."}','{}'),
(true,true,'agent','jcs-sdr-contabilidade','SDR Contabilidade','Prospecção para escritórios contábeis.','Serviços','PME','whatsapp','JCS','{"master_prompt":"Você é SDR para contabilidade..."}','{}'),
(true,true,'agent','jcs-sdr-imobiliaria','SDR Imobiliária','Prospecção para imobiliárias.','Imobiliário','PME','whatsapp','JCS','{"master_prompt":"Você é SDR para imobiliária..."}','{}'),
(true,true,'cadence','jcs-cad-outbound-frio','Outbound Frio','Cadência fria multi-canal 14 dias.','Outbound','Geral','multi','JCS','{"days":[{"day":1,"channel":"email","message":"Olá {nome}..."},{"day":3,"channel":"whatsapp","message":"Oi {nome}..."},{"day":7,"channel":"email","message":"Follow up..."}]}','{"avg_conversion":0.06}'),
(true,true,'cadence','jcs-cad-reativacao','Reativação de Leads','Recupera leads frios.','Reativação','Geral','multi','JCS','{"days":[{"day":1,"channel":"whatsapp","message":"Voltando ao contato..."}]}','{}'),
(true,true,'cadence','jcs-cad-pos-proposta','Pós-Proposta','Follow-up após envio de proposta.','Follow-up','Geral','email','JCS','{"days":[]}','{}'),
(true,true,'cadence','jcs-cad-recuperacao','Recuperação de Oportunidades Perdidas','Reabre oportunidades perdidas.','Recuperação','Geral','multi','JCS','{"days":[]}','{}'),
(true,true,'cadence','jcs-cad-inbound-wa','Inbound WhatsApp','Atendimento inbound rápido.','Inbound','Geral','whatsapp','JCS','{"days":[]}','{}'),
(true,true,'cadence','jcs-cad-diagnostico-ti','Diagnóstico de TI','Cadência para agendar diagnóstico.','TI','SMB','multi','JCS','{"days":[]}','{}'),
(true,true,'package','jcs-pack-ti','Pacote JCS Gestão de TI','Agente + Cadência + Objeções + Treinamento.','TI','SMB','multi','JCS','{"agent_slug":"jcs-sdr-ti","cadence_slug":"jcs-cad-diagnostico-ti"}','{}'),
(true,true,'package','jcs-pack-ciber','Pacote JCS Cibersegurança','Pacote completo cibersegurança.','Cibersegurança','SMB','multi','JCS','{"agent_slug":"jcs-sdr-ciberseguranca","cadence_slug":"jcs-cad-outbound-frio"}','{}'),
(true,true,'package','jcs-pack-backup','Pacote JCS Backup','Pacote backup.','Backup','SMB','multi','JCS','{"agent_slug":"jcs-sdr-backup","cadence_slug":"jcs-cad-outbound-frio"}','{}'),
(true,true,'package','jcs-pack-m365','Pacote JCS Microsoft 365','Pacote M365.','Cloud','SMB','multi','JCS','{"agent_slug":"jcs-sdr-m365","cadence_slug":"jcs-cad-outbound-frio"}','{}');
