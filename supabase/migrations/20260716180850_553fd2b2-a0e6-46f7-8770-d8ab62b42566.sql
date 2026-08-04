
-- =========== 1. New columns on ideal_customer_profiles ===========
ALTER TABLE public.ideal_customer_profiles
  ADD COLUMN IF NOT EXISTS source_template_id uuid;

-- =========== 2. icp_criteria_catalog ===========
CREATE TABLE IF NOT EXISTS public.icp_criteria_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','number','currency','boolean','select','multiselect','date','range')),
  category text NOT NULL CHECK (category IN ('company','location','decision_maker','contact','signals','custom')),
  default_operator text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_custom boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, field_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.icp_criteria_catalog TO authenticated;
GRANT ALL ON public.icp_criteria_catalog TO service_role;
ALTER TABLE public.icp_criteria_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "icp_catalog_select" ON public.icp_criteria_catalog
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = public.current_org_id());

CREATE POLICY "icp_catalog_insert" ON public.icp_criteria_catalog
  FOR INSERT TO authenticated
  WITH CHECK (
    (organization_id IS NULL AND public.is_superadmin(auth.uid()))
    OR (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  );

CREATE POLICY "icp_catalog_update" ON public.icp_criteria_catalog
  FOR UPDATE TO authenticated
  USING (
    (organization_id IS NULL AND public.is_superadmin(auth.uid()))
    OR (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  );

CREATE POLICY "icp_catalog_delete" ON public.icp_criteria_catalog
  FOR DELETE TO authenticated
  USING (
    (organization_id IS NULL AND public.is_superadmin(auth.uid()))
    OR (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  );

CREATE TRIGGER trg_icp_catalog_updated_at
  BEFORE UPDATE ON public.icp_criteria_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== 3. icp_templates ===========
CREATE TABLE IF NOT EXISTS public.icp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  category text,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  minimum_score integer NOT NULL DEFAULT 80,
  is_global boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.icp_templates TO authenticated;
GRANT ALL ON public.icp_templates TO service_role;
ALTER TABLE public.icp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "icp_templates_select" ON public.icp_templates
  FOR SELECT TO authenticated
  USING (is_global = true OR organization_id = public.current_org_id());

CREATE POLICY "icp_templates_insert" ON public.icp_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    (is_global = true AND organization_id IS NULL AND public.is_superadmin(auth.uid()))
    OR (is_global = false AND organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  );

CREATE POLICY "icp_templates_update" ON public.icp_templates
  FOR UPDATE TO authenticated
  USING (
    (is_global = true AND public.is_superadmin(auth.uid()))
    OR (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  );

CREATE POLICY "icp_templates_delete" ON public.icp_templates
  FOR DELETE TO authenticated
  USING (
    (is_global = true AND public.is_superadmin(auth.uid()))
    OR (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  );

CREATE TRIGGER trg_icp_templates_updated_at
  BEFORE UPDATE ON public.icp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== 4. icp_rules ===========
CREATE TABLE IF NOT EXISTS public.icp_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icp_id uuid NOT NULL REFERENCES public.ideal_customer_profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL,
  category text NOT NULL,
  operator text NOT NULL,
  value jsonb,
  weight integer NOT NULL DEFAULT 10,
  required boolean NOT NULL DEFAULT false,
  disqualifying boolean NOT NULL DEFAULT false,
  positive_or_negative text NOT NULL DEFAULT 'positive' CHECK (positive_or_negative IN ('positive','negative')),
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icp_rules_icp ON public.icp_rules(icp_id, "order");
CREATE INDEX IF NOT EXISTS idx_icp_rules_org ON public.icp_rules(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.icp_rules TO authenticated;
GRANT ALL ON public.icp_rules TO service_role;
ALTER TABLE public.icp_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "icp_rules_select" ON public.icp_rules
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "icp_rules_insert" ON public.icp_rules
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY "icp_rules_update" ON public.icp_rules
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "icp_rules_delete" ON public.icp_rules
  FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id());

CREATE TRIGGER trg_icp_rules_updated_at
  BEFORE UPDATE ON public.icp_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== 5. Seed default criteria catalog (global) ===========
INSERT INTO public.icp_criteria_catalog (organization_id, field_key, field_label, field_type, category, default_operator, options, description) VALUES
  (NULL, 'cnae',                'CNAE',                    'multiselect','company',      'in',           '[]'::jsonb, 'Códigos CNAE principal ou secundário'),
  (NULL, 'segmento',             'Segmento',                'multiselect','company',      'in',           '[]'::jsonb, 'Segmento / categoria da empresa'),
  (NULL, 'porte',                'Porte',                   'multiselect','company',      'in',           '["ME","EPP","MEDIO","GRANDE"]'::jsonb, 'Porte declarado'),
  (NULL, 'faturamento_estimado', 'Faturamento estimado',    'currency',   'company',      'greater_or_equal','[]'::jsonb, 'Faturamento anual estimado (R$)'),
  (NULL, 'capital_social',       'Capital social',          'currency',   'company',      'greater_or_equal','[]'::jsonb, 'Capital social declarado (R$)'),
  (NULL, 'funcionarios',         'Funcionários',            'range',      'company',      'between',      '[]'::jsonb, 'Faixa de funcionários'),
  (NULL, 'idade_empresa',        'Idade da empresa (anos)', 'number',     'company',      'greater_or_equal','[]'::jsonb, 'Anos desde a data de abertura'),
  (NULL, 'situacao_cadastral',   'Situação cadastral',      'multiselect','company',      'in',           '["ATIVA","SUSPENSA","INAPTA","BAIXADA"]'::jsonb, 'Situação junto à Receita'),
  (NULL, 'filiais',              'Filiais',                 'number',     'company',      'greater_or_equal','[]'::jsonb, 'Quantidade de filiais'),
  (NULL, 'pais',                 'País',                    'select',     'location',     'equals',       '["BR"]'::jsonb, 'País da sede'),
  (NULL, 'uf',                   'UF',                      'multiselect','location',     'in',           '[]'::jsonb, 'Estado (UF)'),
  (NULL, 'cidade',               'Cidade',                  'multiselect','location',     'in',           '[]'::jsonb, 'Município'),
  (NULL, 'cargo',                'Cargo',                   'multiselect','decision_maker','in',           '[]'::jsonb, 'Cargo do decisor'),
  (NULL, 'senioridade',          'Senioridade',             'multiselect','decision_maker','in',           '["C-Level","Diretor","Gerente","Coordenador","Analista"]'::jsonb, 'Nível hierárquico'),
  (NULL, 'departamento',         'Departamento',            'multiselect','decision_maker','in',           '["Comercial","Marketing","Financeiro","TI","RH","Operações"]'::jsonb, 'Área do decisor'),
  (NULL, 'decisor_encontrado',   'Decisor encontrado',      'boolean',    'decision_maker','true',         '[]'::jsonb, 'Existe ao menos um decisor mapeado'),
  (NULL, 'email_encontrado',     'E-mail encontrado',       'boolean',    'contact',      'true',         '[]'::jsonb, 'E-mail de contato disponível'),
  (NULL, 'telefone_encontrado',  'Telefone encontrado',     'boolean',    'contact',      'true',         '[]'::jsonb, 'Telefone disponível'),
  (NULL, 'whatsapp_encontrado',  'WhatsApp encontrado',     'boolean',    'contact',      'true',         '[]'::jsonb, 'WhatsApp disponível'),
  (NULL, 'site_encontrado',      'Site encontrado',         'boolean',    'contact',      'true',         '[]'::jsonb, 'Site institucional disponível'),
  (NULL, 'sinais_expansao',      'Sinais de expansão',      'boolean',    'signals',      'true',         '[]'::jsonb, 'Empresa em crescimento (novas filiais, aumento de headcount)'),
  (NULL, 'vaga_aberta',          'Vaga aberta',             'boolean',    'signals',      'true',         '[]'::jsonb, 'Existem vagas abertas relevantes'),
  (NULL, 'tecnologia',           'Tecnologia identificada', 'multiselect','signals',      'in',           '[]'::jsonb, 'Tecnologias detectadas no site')
ON CONFLICT DO NOTHING;

-- =========== 6. Seed global templates with pre-filled rules ===========
INSERT INTO public.icp_templates (organization_id, name, slug, description, category, is_global, minimum_score, rules) VALUES
  (NULL, 'Serviços B2B',   'servicos-b2b',   'Empresas de serviços profissionais B2B com decisor comercial acessível.', 'servicos',      true, 80,
    '[
      {"field_key":"porte","field_label":"Porte","field_type":"multiselect","category":"company","operator":"in","value":["EPP","MEDIO","GRANDE"],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":0},
      {"field_key":"funcionarios","field_label":"Funcionários","field_type":"range","category":"company","operator":"between","value":[20,500],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":1},
      {"field_key":"situacao_cadastral","field_label":"Situação cadastral","field_type":"multiselect","category":"company","operator":"in","value":["ATIVA"],"weight":10,"required":true,"disqualifying":true,"positive_or_negative":"positive","order":2},
      {"field_key":"idade_empresa","field_label":"Idade da empresa","field_type":"number","category":"company","operator":"greater_or_equal","value":3,"weight":10,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":3},
      {"field_key":"decisor_encontrado","field_label":"Decisor encontrado","field_type":"boolean","category":"decision_maker","operator":"true","value":true,"weight":20,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":4},
      {"field_key":"email_encontrado","field_label":"E-mail encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":5},
      {"field_key":"site_encontrado","field_label":"Site encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":6}
    ]'::jsonb),
  (NULL, 'Indústria', 'industria', 'Indústrias com operação consolidada e capacidade de investimento.', 'industria', true, 80,
    '[
      {"field_key":"cnae","field_label":"CNAE","field_type":"multiselect","category":"company","operator":"in","value":["10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33"],"weight":25,"required":true,"disqualifying":false,"positive_or_negative":"positive","order":0},
      {"field_key":"porte","field_label":"Porte","field_type":"multiselect","category":"company","operator":"in","value":["MEDIO","GRANDE"],"weight":20,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":1},
      {"field_key":"funcionarios","field_label":"Funcionários","field_type":"range","category":"company","operator":"between","value":[50,2000],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":2},
      {"field_key":"situacao_cadastral","field_label":"Situação cadastral","field_type":"multiselect","category":"company","operator":"in","value":["ATIVA"],"weight":10,"required":true,"disqualifying":true,"positive_or_negative":"positive","order":3},
      {"field_key":"capital_social","field_label":"Capital social","field_type":"currency","category":"company","operator":"greater_or_equal","value":500000,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":4},
      {"field_key":"decisor_encontrado","field_label":"Decisor encontrado","field_type":"boolean","category":"decision_maker","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":5}
    ]'::jsonb),
  (NULL, 'Contabilidade', 'contabilidade', 'Escritórios de contabilidade com carteira ativa.', 'servicos', true, 80,
    '[
      {"field_key":"cnae","field_label":"CNAE","field_type":"multiselect","category":"company","operator":"in","value":["6920"],"weight":30,"required":true,"disqualifying":false,"positive_or_negative":"positive","order":0},
      {"field_key":"situacao_cadastral","field_label":"Situação cadastral","field_type":"multiselect","category":"company","operator":"in","value":["ATIVA"],"weight":10,"required":true,"disqualifying":true,"positive_or_negative":"positive","order":1},
      {"field_key":"porte","field_label":"Porte","field_type":"multiselect","category":"company","operator":"in","value":["ME","EPP","MEDIO"],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":2},
      {"field_key":"idade_empresa","field_label":"Idade da empresa","field_type":"number","category":"company","operator":"greater_or_equal","value":2,"weight":10,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":3},
      {"field_key":"email_encontrado","field_label":"E-mail encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":4},
      {"field_key":"whatsapp_encontrado","field_label":"WhatsApp encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":20,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":5}
    ]'::jsonb),
  (NULL, 'Saúde', 'saude', 'Clínicas, hospitais e operadoras de saúde.', 'saude', true, 80,
    '[
      {"field_key":"cnae","field_label":"CNAE","field_type":"multiselect","category":"company","operator":"in","value":["86","87"],"weight":30,"required":true,"disqualifying":false,"positive_or_negative":"positive","order":0},
      {"field_key":"situacao_cadastral","field_label":"Situação cadastral","field_type":"multiselect","category":"company","operator":"in","value":["ATIVA"],"weight":10,"required":true,"disqualifying":true,"positive_or_negative":"positive","order":1},
      {"field_key":"porte","field_label":"Porte","field_type":"multiselect","category":"company","operator":"in","value":["EPP","MEDIO","GRANDE"],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":2},
      {"field_key":"funcionarios","field_label":"Funcionários","field_type":"range","category":"company","operator":"between","value":[10,1000],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":3},
      {"field_key":"decisor_encontrado","field_label":"Decisor encontrado","field_type":"boolean","category":"decision_maker","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":4},
      {"field_key":"email_encontrado","field_label":"E-mail encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":5}
    ]'::jsonb),
  (NULL, 'Imobiliária', 'imobiliaria', 'Imobiliárias, incorporadoras e construtoras.', 'imobiliario', true, 80,
    '[
      {"field_key":"cnae","field_label":"CNAE","field_type":"multiselect","category":"company","operator":"in","value":["68","41","42","43"],"weight":25,"required":true,"disqualifying":false,"positive_or_negative":"positive","order":0},
      {"field_key":"situacao_cadastral","field_label":"Situação cadastral","field_type":"multiselect","category":"company","operator":"in","value":["ATIVA"],"weight":10,"required":true,"disqualifying":true,"positive_or_negative":"positive","order":1},
      {"field_key":"porte","field_label":"Porte","field_type":"multiselect","category":"company","operator":"in","value":["EPP","MEDIO","GRANDE"],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":2},
      {"field_key":"decisor_encontrado","field_label":"Decisor encontrado","field_type":"boolean","category":"decision_maker","operator":"true","value":true,"weight":20,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":3},
      {"field_key":"whatsapp_encontrado","field_label":"WhatsApp encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":4},
      {"field_key":"site_encontrado","field_label":"Site encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":5}
    ]'::jsonb),
  (NULL, 'Tecnologia', 'tecnologia', 'Empresas SaaS, software house e serviços de TI.', 'tecnologia', true, 80,
    '[
      {"field_key":"cnae","field_label":"CNAE","field_type":"multiselect","category":"company","operator":"in","value":["62","63"],"weight":25,"required":true,"disqualifying":false,"positive_or_negative":"positive","order":0},
      {"field_key":"funcionarios","field_label":"Funcionários","field_type":"range","category":"company","operator":"between","value":[10,500],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":1},
      {"field_key":"situacao_cadastral","field_label":"Situação cadastral","field_type":"multiselect","category":"company","operator":"in","value":["ATIVA"],"weight":10,"required":true,"disqualifying":true,"positive_or_negative":"positive","order":2},
      {"field_key":"decisor_encontrado","field_label":"Decisor encontrado","field_type":"boolean","category":"decision_maker","operator":"true","value":true,"weight":20,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":3},
      {"field_key":"email_encontrado","field_label":"E-mail encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":4},
      {"field_key":"tecnologia","field_label":"Tecnologia identificada","field_type":"multiselect","category":"signals","operator":"exists","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":5}
    ]'::jsonb),
  (NULL, 'Distribuição', 'distribuicao', 'Distribuidoras e atacadistas com operação logística.', 'comercio', true, 80,
    '[
      {"field_key":"cnae","field_label":"CNAE","field_type":"multiselect","category":"company","operator":"in","value":["46"],"weight":25,"required":true,"disqualifying":false,"positive_or_negative":"positive","order":0},
      {"field_key":"porte","field_label":"Porte","field_type":"multiselect","category":"company","operator":"in","value":["EPP","MEDIO","GRANDE"],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":1},
      {"field_key":"funcionarios","field_label":"Funcionários","field_type":"range","category":"company","operator":"between","value":[20,1000],"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":2},
      {"field_key":"situacao_cadastral","field_label":"Situação cadastral","field_type":"multiselect","category":"company","operator":"in","value":["ATIVA"],"weight":10,"required":true,"disqualifying":true,"positive_or_negative":"positive","order":3},
      {"field_key":"filiais","field_label":"Filiais","field_type":"number","category":"company","operator":"greater_or_equal","value":1,"weight":10,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":4},
      {"field_key":"decisor_encontrado","field_label":"Decisor encontrado","field_type":"boolean","category":"decision_maker","operator":"true","value":true,"weight":15,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":5},
      {"field_key":"whatsapp_encontrado","field_label":"WhatsApp encontrado","field_type":"boolean","category":"contact","operator":"true","value":true,"weight":10,"required":false,"disqualifying":false,"positive_or_negative":"positive","order":6}
    ]'::jsonb),
  (NULL, 'Em branco', 'em-branco', 'Comece do zero e monte seu próprio ICP.', 'custom', true, 80, '[]'::jsonb)
ON CONFLICT (organization_id, slug) DO NOTHING;

-- =========== 7. Migrate existing ICPs (criteria_json + weights_json → icp_rules) ===========
DO $$
DECLARE
  icp RECORD;
  cj jsonb;
  wj jsonb;
  ord int;
  required_set jsonb;
BEGIN
  FOR icp IN SELECT id, organization_id, criteria_json, weights_json FROM public.ideal_customer_profiles LOOP
    -- Skip if this ICP already has rules migrated
    IF EXISTS (SELECT 1 FROM public.icp_rules WHERE icp_id = icp.id) THEN CONTINUE; END IF;

    cj := COALESCE(icp.criteria_json, '{}'::jsonb);
    wj := COALESCE(icp.weights_json, '{}'::jsonb);
    required_set := COALESCE(cj->'required_criteria', '[]'::jsonb);
    ord := 0;

    -- desired_cnaes
    IF jsonb_array_length(COALESCE(cj->'desired_cnaes','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'cnae','CNAE','multiselect','company','in', cj->'desired_cnaes', COALESCE((wj->>'desired_cnaes')::int, 20), required_set ? 'desired_cnaes','positive', ord);
      ord := ord + 1;
    END IF;
    -- forbidden_cnaes
    IF jsonb_array_length(COALESCE(cj->'forbidden_cnaes','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, disqualifying, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'cnae','CNAE proibido','multiselect','company','not_in', cj->'forbidden_cnaes', 0, false, true, 'negative', ord);
      ord := ord + 1;
    END IF;
    -- segments, states, cities, portes, situacao_cadastral, desired_roles, forbidden_roles
    IF jsonb_array_length(COALESCE(cj->'segments','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'segmento','Segmento','multiselect','company','in', cj->'segments', COALESCE((wj->>'segments')::int, 10), required_set ? 'segments','positive', ord);
      ord := ord + 1;
    END IF;
    IF jsonb_array_length(COALESCE(cj->'states','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'uf','UF','multiselect','location','in', cj->'states', COALESCE((wj->>'states')::int, 5), required_set ? 'states','positive', ord);
      ord := ord + 1;
    END IF;
    IF jsonb_array_length(COALESCE(cj->'cities','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'cidade','Cidade','multiselect','location','in', cj->'cities', COALESCE((wj->>'cities')::int, 5), required_set ? 'cities','positive', ord);
      ord := ord + 1;
    END IF;
    IF jsonb_array_length(COALESCE(cj->'portes','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'porte','Porte','multiselect','company','in', cj->'portes', COALESCE((wj->>'portes')::int, 10), required_set ? 'portes','positive', ord);
      ord := ord + 1;
    END IF;
    IF jsonb_array_length(COALESCE(cj->'situacao_cadastral','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'situacao_cadastral','Situação cadastral','multiselect','company','in', cj->'situacao_cadastral', COALESCE((wj->>'situacao_cadastral')::int, 8), required_set ? 'situacao_cadastral','positive', ord);
      ord := ord + 1;
    END IF;
    IF jsonb_array_length(COALESCE(cj->'desired_roles','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'cargo','Cargos desejados','multiselect','decision_maker','in', cj->'desired_roles', COALESCE((wj->>'desired_roles')::int, 8), required_set ? 'desired_roles','positive', ord);
      ord := ord + 1;
    END IF;
    IF jsonb_array_length(COALESCE(cj->'forbidden_roles','[]'::jsonb)) > 0 THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, disqualifying, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'cargo','Cargos proibidos','multiselect','decision_maker','not_in', cj->'forbidden_roles', 0, true, 'negative', ord);
      ord := ord + 1;
    END IF;

    -- numeric criteria
    IF (cj ? 'min_capital_social') AND (cj->>'min_capital_social') IS NOT NULL THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'capital_social','Capital social mínimo','currency','company','greater_or_equal', cj->'min_capital_social', COALESCE((wj->>'min_capital_social')::int, 8), required_set ? 'min_capital_social','positive', ord);
      ord := ord + 1;
    END IF;
    IF (cj ? 'min_faturamento') AND (cj->>'min_faturamento') IS NOT NULL THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'faturamento_estimado','Faturamento estimado mínimo','currency','company','greater_or_equal', cj->'min_faturamento', COALESCE((wj->>'min_faturamento')::int, 8), required_set ? 'min_faturamento','positive', ord);
      ord := ord + 1;
    END IF;
    IF ((cj ? 'min_employees') AND (cj->>'min_employees') IS NOT NULL) OR ((cj ? 'max_employees') AND (cj->>'max_employees') IS NOT NULL) THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'funcionarios','Funcionários','range','company','between', jsonb_build_array(COALESCE((cj->>'min_employees')::numeric, 0), COALESCE((cj->>'max_employees')::numeric, 999999)), COALESCE((wj->>'employees')::int, 12), (required_set ? 'employees') OR (required_set ? 'min_employees') OR (required_set ? 'max_employees'),'positive', ord);
      ord := ord + 1;
    END IF;
    IF (cj ? 'min_company_age_years') AND (cj->>'min_company_age_years') IS NOT NULL THEN
      INSERT INTO public.icp_rules(icp_id, organization_id, field_key, field_label, field_type, category, operator, value, weight, required, positive_or_negative, "order")
      VALUES (icp.id, icp.organization_id, 'idade_empresa','Idade mínima','number','company','greater_or_equal', cj->'min_company_age_years', COALESCE((wj->>'min_company_age_years')::int, 6), required_set ? 'min_company_age_years','positive', ord);
      ord := ord + 1;
    END IF;
  END LOOP;
END $$;
