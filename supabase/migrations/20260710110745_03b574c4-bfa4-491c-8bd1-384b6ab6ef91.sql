
ALTER TABLE public.prospecting_results
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS situacao_cadastral text,
  ADD COLUMN IF NOT EXISTS natureza_juridica text,
  ADD COLUMN IF NOT EXISTS data_abertura date,
  ADD COLUMN IF NOT EXISTS capital_social numeric,
  ADD COLUMN IF NOT EXISTS discovery_source text,
  ADD COLUMN IF NOT EXISTS enrichment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enrichment_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS enrichment_cost_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prospecting_results_org_cnpj
  ON public.prospecting_results (organization_id, cnpj)
  WHERE cnpj IS NOT NULL;

INSERT INTO public.prospecting_sources (slug, name, icon, description, config_schema, active)
VALUES (
  'casa_dos_dados',
  'Casa dos Dados',
  'building-2',
  'Base cadastral oficial de empresas (CNPJ, CNAE, porte, situação cadastral).',
  jsonb_build_object('fields', jsonb_build_array(
    jsonb_build_object('key','cnae_principal','label','CNAE principal','type','text'),
    jsonb_build_object('key','cnaes_secundarios','label','CNAEs secundários (separados por vírgula)','type','text'),
    jsonb_build_object('key','uf','label','UF','type','text'),
    jsonb_build_object('key','cidade','label','Cidade','type','text'),
    jsonb_build_object('key','porte','label','Porte (ME, EPP, DEMAIS)','type','text'),
    jsonb_build_object('key','situacao_cadastral','label','Situação cadastral','type','text','default','ATIVA'),
    jsonb_build_object('key','natureza_juridica','label','Natureza jurídica (código)','type','text'),
    jsonb_build_object('key','data_abertura_de','label','Data de abertura de (YYYY-MM-DD)','type','text'),
    jsonb_build_object('key','data_abertura_ate','label','Data de abertura até (YYYY-MM-DD)','type','text'),
    jsonb_build_object('key','capital_social_min','label','Capital social mínimo (R$)','type','number'),
    jsonb_build_object('key','capital_social_max','label','Capital social máximo (R$)','type','number'),
    jsonb_build_object('key','limite','label','Quantidade máxima de resultados','type','number','default',100)
  )),
  true
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      icon = EXCLUDED.icon,
      description = EXCLUDED.description,
      config_schema = EXCLUDED.config_schema,
      active = true;
