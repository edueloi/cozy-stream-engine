
-- 1. Sources catalog (global)
CREATE TABLE public.prospecting_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  icon text,
  description text,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.prospecting_sources TO authenticated;
GRANT ALL ON public.prospecting_sources TO service_role;
ALTER TABLE public.prospecting_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources readable by authenticated" ON public.prospecting_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "sources writable by superadmin" ON public.prospecting_sources FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_prospecting_sources_updated BEFORE UPDATE ON public.prospecting_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Searches
CREATE TABLE public.prospecting_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_slug text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  apify_run_id text,
  total_found integer NOT NULL DEFAULT 0,
  total_enriched integer NOT NULL DEFAULT 0,
  total_qualified integer NOT NULL DEFAULT 0,
  total_imported integer NOT NULL DEFAULT 0,
  total_discarded integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospecting_searches TO authenticated;
GRANT ALL ON public.prospecting_searches TO service_role;
ALTER TABLE public.prospecting_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "searches by org" ON public.prospecting_searches FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_prospecting_searches_org BEFORE INSERT ON public.prospecting_searches FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER trg_prospecting_searches_updated BEFORE UPDATE ON public.prospecting_searches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_prospecting_searches_org ON public.prospecting_searches(organization_id);

-- 3. Results
CREATE TABLE public.prospecting_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  search_id uuid REFERENCES public.prospecting_searches(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  phone text,
  email text,
  website text,
  address text,
  city text,
  state text,
  category text,
  segment text,
  cnae text,
  rating numeric,
  reviews_count integer,
  linkedin_url text,
  instagram_url text,
  google_maps_url text,
  followers integer,
  bio text,
  estimated_employees integer,
  company_size text,
  estimated_revenue text,
  technologies jsonb DEFAULT '[]'::jsonb,
  enrichment jsonb DEFAULT '{}'::jsonb,
  raw jsonb DEFAULT '{}'::jsonb,
  score integer DEFAULT 0,
  score_label text,
  status text NOT NULL DEFAULT 'new',
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospecting_results TO authenticated;
GRANT ALL ON public.prospecting_results TO service_role;
ALTER TABLE public.prospecting_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "results by org" ON public.prospecting_results FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_prospecting_results_org BEFORE INSERT ON public.prospecting_results FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER trg_prospecting_results_updated BEFORE UPDATE ON public.prospecting_results FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_prospecting_results_search ON public.prospecting_results(search_id);
CREATE INDEX idx_prospecting_results_org ON public.prospecting_results(organization_id);

-- 4. Decision makers
CREATE TABLE public.prospecting_decision_makers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  result_id uuid REFERENCES public.prospecting_results(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  level text,
  linkedin text,
  email text,
  phone text,
  source text,
  confidence integer DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospecting_decision_makers TO authenticated;
GRANT ALL ON public.prospecting_decision_makers TO service_role;
ALTER TABLE public.prospecting_decision_makers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm by org" ON public.prospecting_decision_makers FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() OR public.is_superadmin(auth.uid()));
CREATE TRIGGER trg_prospecting_dm_org BEFORE INSERT ON public.prospecting_decision_makers FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();
CREATE TRIGGER trg_prospecting_dm_updated BEFORE UPDATE ON public.prospecting_decision_makers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_prospecting_dm_result ON public.prospecting_decision_makers(result_id);

-- 5. Organization integrations (Apify token, etc.)
CREATE TABLE public.organization_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, provider)
);
-- No SELECT for authenticated to prevent leaking token; reads go through server fns using service_role
GRANT ALL ON public.organization_integrations TO service_role;
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integrations service only" ON public.organization_integrations FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
CREATE TRIGGER trg_org_integrations_updated BEFORE UPDATE ON public.organization_integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed sources
INSERT INTO public.prospecting_sources (slug, name, icon, description, config_schema) VALUES
('google_maps', 'Google Maps', 'map-pin', 'Buscar empresas no Google Maps por palavra-chave e localização', '{"fields":[{"key":"keyword","label":"Palavra-chave","type":"text","required":true},{"key":"city","label":"Cidade","type":"text","required":true},{"key":"state","label":"Estado","type":"text"},{"key":"radius_km","label":"Raio (km)","type":"number","default":50},{"key":"limit","label":"Limite","type":"number","default":100}]}'::jsonb),
('linkedin_companies', 'LinkedIn Empresas', 'building', 'Buscar empresas no LinkedIn', '{"fields":[{"key":"keyword","label":"Segmento","type":"text","required":true},{"key":"location","label":"Localização","type":"text"},{"key":"min_employees","label":"Funcionários mín.","type":"number"},{"key":"limit","label":"Limite","type":"number","default":50}]}'::jsonb),
('linkedin_people', 'LinkedIn Pessoas', 'users', 'Buscar decisores no LinkedIn', '{"fields":[{"key":"role","label":"Cargo","type":"text","required":true},{"key":"company","label":"Empresa","type":"text"},{"key":"location","label":"Localização","type":"text"},{"key":"limit","label":"Limite","type":"number","default":50}]}'::jsonb),
('instagram', 'Instagram Empresas', 'instagram', 'Buscar perfis comerciais no Instagram', '{"fields":[{"key":"keyword","label":"Hashtag/palavra","type":"text","required":true},{"key":"city","label":"Cidade","type":"text"},{"key":"limit","label":"Limite","type":"number","default":50}]}'::jsonb),
('website', 'Sites Corporativos', 'globe', 'Importar empresas a partir de URLs', '{"fields":[{"key":"urls","label":"URLs (uma por linha)","type":"textarea","required":true}]}'::jsonb),
('csv', 'Planilha CSV', 'file-text', 'Upload de CSV', '{"fields":[]}'::jsonb),
('xlsx', 'Planilha XLSX', 'file-spreadsheet', 'Upload de XLSX', '{"fields":[]}'::jsonb),
('api', 'API Própria', 'plug', 'Endpoint customizado', '{"fields":[{"key":"url","label":"URL","type":"text","required":true}]}'::jsonb),
('webhook', 'Webhook', 'webhook', 'Recebimento via webhook', '{"fields":[]}'::jsonb);
