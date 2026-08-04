
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'personalizado',
  source_type text NOT NULL,
  source_url text,
  file_path text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  chunk_count integer NOT NULL DEFAULT 0,
  file_size_bytes bigint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_sources TO authenticated;
GRANT ALL ON public.knowledge_sources TO service_role;

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read knowledge_sources"
  ON public.knowledge_sources FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "org managers write knowledge_sources"
  ON public.knowledge_sources FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE INDEX knowledge_sources_org_idx ON public.knowledge_sources(organization_id);

CREATE TRIGGER set_knowledge_sources_org BEFORE INSERT ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

CREATE TRIGGER set_knowledge_sources_updated BEFORE UPDATE ON public.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_text text NOT NULL,
  embedding vector(1536),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read knowledge_chunks"
  ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY "org managers write knowledge_chunks"
  ON public.knowledge_chunks FOR ALL TO authenticated
  USING (organization_id = public.current_org_id() AND public.is_manager(auth.uid()))
  WITH CHECK (organization_id = public.current_org_id() AND public.is_manager(auth.uid()));

CREATE INDEX knowledge_chunks_org_idx ON public.knowledge_chunks(organization_id);
CREATE INDEX knowledge_chunks_source_idx ON public.knowledge_chunks(source_id);
CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER set_knowledge_chunks_org BEFORE INSERT ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS knowledge_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS knowledge_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_context_documents integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS search_threshold numeric NOT NULL DEFAULT 0.7;

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  _org uuid,
  _query_embedding vector(1536),
  _match_count integer DEFAULT 5,
  _threshold numeric DEFAULT 0.7,
  _categories text[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  source_id uuid,
  source_title text,
  source_category text,
  chunk_text text,
  similarity numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.source_id, s.title, s.category, c.chunk_text,
    (1 - (c.embedding <=> _query_embedding))::numeric
  FROM public.knowledge_chunks c
  JOIN public.knowledge_sources s ON s.id = c.source_id
  WHERE c.organization_id = _org
    AND c.embedding IS NOT NULL
    AND (_categories IS NULL OR s.category = ANY(_categories))
    AND (1 - (c.embedding <=> _query_embedding)) >= _threshold
  ORDER BY c.embedding <=> _query_embedding ASC
  LIMIT _match_count
$$;
