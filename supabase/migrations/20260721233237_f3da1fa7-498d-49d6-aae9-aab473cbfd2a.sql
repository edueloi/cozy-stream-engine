-- Backfill orphan rows to current owner if possible; delete truly ownerless leftovers
UPDATE public.enrichment_cache SET organization_id = NULL WHERE FALSE; -- no-op guard
DELETE FROM public.enrichment_cache WHERE organization_id IS NULL;

ALTER TABLE public.enrichment_cache ALTER COLUMN organization_id SET NOT NULL;

DROP POLICY IF EXISTS enrichment_cache_all ON public.enrichment_cache;

CREATE POLICY enrichment_cache_select ON public.enrichment_cache
  FOR SELECT TO authenticated
  USING (organization_id = public.current_org_id());

CREATE POLICY enrichment_cache_insert ON public.enrichment_cache
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY enrichment_cache_update ON public.enrichment_cache
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

CREATE POLICY enrichment_cache_delete ON public.enrichment_cache
  FOR DELETE TO authenticated
  USING (organization_id = public.current_org_id());

DROP TRIGGER IF EXISTS set_enrichment_cache_org ON public.enrichment_cache;
CREATE TRIGGER set_enrichment_cache_org
  BEFORE INSERT ON public.enrichment_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_organization_id();