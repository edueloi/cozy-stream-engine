import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ICP_SEGMENTS = [
  "industria",
  "transportadora",
  "construtora",
  "contabilidade",
  "clinica",
  "distribuidora",
  "escritorio",
];

function scoreLabel(score: number): "frio" | "morno" | "quente" {
  if (score >= 71) return "quente";
  if (score >= 41) return "morno";
  return "frio";
}

export function calculateProspectScore(r: {
  website?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  phone?: string | null;
  estimated_employees?: number | null;
  segment?: string | null;
  category?: string | null;
  technologies?: string[] | null;
  decision_makers_count?: number;
}): { score: number; label: "frio" | "morno" | "quente" } {
  let s = 0;
  if (r.website) s += 12;
  if (r.email) s += 10;
  if (r.linkedin_url) s += 12;
  if (r.instagram_url) s += 4;
  if (r.phone) s += 8;
  const emp = r.estimated_employees ?? 0;
  if (emp >= 10) s += 10;
  if (emp >= 25) s += 8;
  if (emp >= 100) s += 6;
  const segHay = `${r.segment ?? ""} ${r.category ?? ""}`.toLowerCase();
  if (ICP_SEGMENTS.some((k) => segHay.includes(k))) s += 18;
  if ((r.technologies?.length ?? 0) > 0) s += 6;
  if ((r.decision_makers_count ?? 0) > 0) s += 12;
  s = Math.min(100, s);
  return { score: s, label: scoreLabel(s) };
}

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("prospecting_sources")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const listSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("prospecting_searches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const listResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { searchId: string; filters?: Record<string, any> }) =>
    z
      .object({
        searchId: z.string().uuid(),
        filters: z.record(z.string(), z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("prospecting_results")
      .select("*")
      .eq("search_id", data.searchId)
      .order("score", { ascending: false })
      .limit(500);
    const f = data.filters ?? {};
    if (f.city) q = q.ilike("city", `%${f.city}%`);
    if (f.state) q = q.eq("state", f.state);
    if (f.segment) q = q.ilike("segment", `%${f.segment}%`);
    if (f.has_website) q = q.not("website", "is", null);
    if (f.has_email) q = q.not("email", "is", null);
    if (f.has_phone) q = q.not("phone", "is", null);
    if (f.has_linkedin) q = q.not("linkedin_url", "is", null);
    if (f.has_instagram) q = q.not("instagram_url", "is", null);
    if (f.min_employees) q = q.gte("estimated_employees", f.min_employees);
    if (f.max_employees) q = q.lte("estimated_employees", f.max_employees);
    if (f.score_label) q = q.eq("score_label", f.score_label);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const createSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { source: string; params: Record<string, any> }) =>
    z.object({ source: z.string().min(1), params: z.record(z.string(), z.any()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: search, error } = await context.supabase
      .from("prospecting_searches")
      .insert({
        source_slug: data.source,
        params: data.params,
        status: "running",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Run asynchronously but await before returning so UI gets results
    try {
      await runSearchInternal(search.id, data.source, data.params, context);
    } catch (e) {
      await context.supabase
        .from("prospecting_searches")
        .update({ status: "failed", error: (e as Error).message })
        .eq("id", search.id);
      throw e;
    }
    return { id: search.id };
  });

async function runSearchInternal(
  searchId: string,
  source: string,
  params: Record<string, any>,
  context: { supabase: any; userId: string },
) {
  const { data: orgId } = await context.supabase.rpc("current_org_id");
  if (!orgId) throw new Error("Organização não encontrada.");

  const { getProviderRuntimeConfig } = await import("@/lib/providers/runtime-config.server");
  const apifyCfg = await getProviderRuntimeConfig({ organizationId: orgId, provider: "apify" });
  const token = apifyCfg.apiKey;
  const apifyBaseUrl = apifyCfg.baseUrl;

  let items: any[] = [];
  let runId: string | null = null;

  if (source === "casa_dos_dados") {
    // ─────────────────────────────────────────────────────────────
    // Release 1.3.8 — Company Search com failover orquestrado.
    // Só ativa quando as flags jcs_data_engine_enabled + smart_flow_ui_enabled
    // estiverem ON. Caso contrário, mantém o comportamento legado (Casa dos
    // Dados direto), preservando o piloto em produção sem mudanças de fluxo.
    // ─────────────────────────────────────────────────────────────
    const { isDataEngineEnabled } = await import("@/lib/jcs-data-engine/cache.server");
    const engineOn = await isDataEngineEnabled(orgId);
    let smartUiOn = false;
    try {
      const { data: settings } = await context.supabase
        .from("app_settings")
        .select("smart_flow_ui_enabled")
        .eq("organization_id", orgId)
        .maybeSingle();
      smartUiOn = Boolean((settings as any)?.smart_flow_ui_enabled);
    } catch { /* legado se não ler flag */ }

    let companies: Array<any>;
    let providerUsed = "casa_dos_dados";
    let fallbackChain: Array<{ provider: string; ok: boolean; reason?: string }> = [];

    if (engineOn && smartUiOn) {
      const { executeCompanySearchWithFailover, FAILOVER_USER_MESSAGE, enrichRowsWithKipflow } = await import(
        "@/lib/prospecting/company-search-failover.server"
      );
      const failoverResult = await executeCompanySearchWithFailover({
        organizationId: orgId,
        searchId,
        filters: params as any,
      });
      fallbackChain = failoverResult.fallbackChain;
      if (!failoverResult.ok) {
        // Mensagem amigável — sem citar provider para vendedor.
        await context.supabase
          .from("prospecting_searches")
          .update({
            status: "failed",
            error: failoverResult.userMessage || FAILOVER_USER_MESSAGE,
          })
          .eq("id", searchId);
        throw new Error(failoverResult.userMessage || FAILOVER_USER_MESSAGE);
      }
      providerUsed = failoverResult.provider ?? "orchestrated";
      companies = failoverResult.rows;

      // Enriquecimento pós-descoberta via Kipflow (quando não foi o provider primário).
      // Preenche email/telefone/website/endereço ausentes para rows com CNPJ.
      if (providerUsed !== "kipflow" && companies.some((c) => c.cnpj)) {
        try {
          const enr = await enrichRowsWithKipflow(companies, orgId, { maxRows: 25 });
          if (enr.enrichedCount > 0) {
            fallbackChain.push({
              provider: "kipflow",
              ok: true,
              reason: `enriched=${enr.enrichedCount}/${enr.attempted}`,
            } as any);
          }
        } catch {
          // silencioso — enriquecimento é best-effort
        }
      }
    } else {
      // Fluxo legado (flags OFF).
      const { searchCasaDosDados } = await import("@/lib/casa-dos-dados.server");
      const casaCfg = await getProviderRuntimeConfig({ organizationId: orgId, provider: "casa_dos_dados" });
      const legacy = await searchCasaDosDados(casaCfg.apiKey ?? undefined, params as any, { baseUrl: casaCfg.baseUrl });
      const { normalizeCompanySegment } = await import("@/lib/company-segment");
      companies = legacy.map((c) => {
        const seg = normalizeCompanySegment({
          segment: null,
          cnae: c.cnae_principal,
          cnaeDescription: (c as any).cnae_descricao ?? null,
        });
        return ({
        company_name: c.razao_social || c.nome_fantasia || c.cnpj,
        cnpj: c.cnpj || null,
        phone: c.telefone,
        email: c.email,
        website: c.site,
        address: c.endereco,
        city: c.cidade,
        state: c.uf,
        segment: seg.segment,
        category: seg.segment,
        cnae: seg.cnae,
        cnaes_secundarios: c.cnaes_secundarios ?? [],
        porte: c.porte,
        situacao_cadastral: c.situacao_cadastral,
        natureza_juridica: c.natureza_juridica,
        data_abertura: c.data_abertura,
        capital_social: c.capital_social,
        discovery_source: "casa_dos_dados",
        raw: c.raw,
      });
      });
    }

    // Persistência unificada (mantém shape original de prospecting_results).
    let inserted = 0;
    const { normalizeCompanySegment: normSeg } = await import("@/lib/company-segment");
    for (const c of companies) {
      const _seg = normSeg({
        segment: c.segment ?? c.category ?? null,
        cnae: c.cnae ?? null,
        cnaeDescription: (c as any).cnae_description ?? (c as any).cnae_descricao ?? null,
      });
      const row = {
        search_id: searchId,
        organization_id: orgId,
        company_name: c.company_name,
        cnpj: c.cnpj || null,
        phone: c.phone,
        email: c.email,
        website: c.website,
        address: c.address,
        city: c.city,
        state: c.state,
        segment: _seg.segment,
        category: _seg.segment ?? c.category,
        cnae: _seg.cnae ?? c.cnae,
        cnaes_secundarios: c.cnaes_secundarios ?? [],
        porte: c.porte,
        situacao_cadastral: c.situacao_cadastral,
        natureza_juridica: c.natureza_juridica,
        data_abertura: c.data_abertura,
        capital_social: c.capital_social,
        discovery_source: c.discovery_source ?? providerUsed,
        enrichment_status: "pending",
        raw: c.raw,
        status: "new",
      };
      const existing = c.cnpj
        ? await context.supabase
            .from("prospecting_results")
            .select("id")
            .eq("organization_id", orgId)
            .eq("cnpj", c.cnpj)
            .maybeSingle()
        : { data: null, error: null };
      if (existing.error) throw new Error(existing.error.message);
      const save = existing.data?.id
        ? await context.supabase
            .from("prospecting_results")
            .update(row)
            .eq("id", existing.data.id)
            .select("id")
            .single()
        : await context.supabase.from("prospecting_results").insert(row).select("id").single();
      const { data: saved, error } = save;
      if (error) throw new Error(error.message);
      if (saved?.id) inserted++;
    }
    await context.supabase
      .from("prospecting_searches")
      .update({
        status: "done",
        total_found: companies.length,
        total_enriched: 0,
        total_qualified: 0,
        // Auditoria técnica — visível a Admin/SuperAdmin via Diagnóstico.
        params: {
          ...(params as any),
          _failover: {
            provider_used: providerUsed,
            fallback_chain: fallbackChain,
          },
        },
      })
      .eq("id", searchId);
    return;
  }

  if (token && source === "google_maps") {
    const { runApifyActor, ACTORS, buildGoogleMapsInput, mapGoogleMapsItem } = await import(
      "@/lib/apify.server"
    );
    const out = await runApifyActor(
      token,
      ACTORS.googleMaps,
      buildGoogleMapsInput(params as any),
      { timeoutMs: 180_000, baseUrl: apifyBaseUrl },
    );
    runId = out.runId;
    items = out.items.map(mapGoogleMapsItem);
  } else if (token && source === "linkedin_companies") {
    const { runApifyActor, ACTORS, buildLinkedinCompaniesInput, mapLinkedinCompanyItem } =
      await import("@/lib/apify.server");
    const out = await runApifyActor(
      token,
      ACTORS.linkedinCompanies,
      buildLinkedinCompaniesInput(params as any),
      { timeoutMs: 240_000, baseUrl: apifyBaseUrl },
    );
    runId = out.runId;
    items = out.items.map(mapLinkedinCompanyItem);
  } else if (token && source === "instagram") {
    const { runApifyActor, ACTORS, buildInstagramInput, mapInstagramItem } = await import(
      "@/lib/apify.server"
    );
    const out = await runApifyActor(
      token,
      ACTORS.instagram,
      buildInstagramInput(params as any),
      { timeoutMs: 240_000, baseUrl: apifyBaseUrl },
    );
    runId = out.runId;
    items = out.items.map(mapInstagramItem);
  } else if (token && source === "linkedin_people") {
    await context.supabase
      .from("prospecting_searches")
      .update({
        status: "failed",
        error:
          "LinkedIn Pessoas exige actor pago dedicado. Use LinkedIn Empresas + 'Buscar decisores' em cada empresa.",
      })
      .eq("id", searchId);
    throw new Error(
      "LinkedIn Pessoas ainda não está ativo. Use LinkedIn Empresas e depois 'Buscar decisores'.",
    );
  } else if (!token) {
    // Sem token: marcar como necessário configurar
    await context.supabase
      .from("prospecting_searches")
      .update({
        status: "failed",
        error: "Token Apify não configurado. Acesse Integrações.",
      })
      .eq("id", searchId);
    throw new Error("Token Apify não configurado.");
  } else {
    await context.supabase
      .from("prospecting_searches")
      .update({
        status: "failed",
        error: `Fonte '${source}' não implementada.`,
      })
      .eq("id", searchId);
    throw new Error(`Fonte '${source}' não implementada.`);
  }

  // Insert + enrich + score
  const { detectTech } = await import("@/lib/tech-detect.server");
  let enriched = 0;
  for (const it of items) {
    const enrichment = it.website ? await detectTech(it.website) : { technologies: [], meta: {} };
    const email = it.email ?? (enrichment.meta as any)?.email ?? null;
    const { normalizeCompanySegment } = await import("@/lib/company-segment");
    const segNorm = normalizeCompanySegment({
      segment: it.category ?? null,
      cnae: (it as any).cnae ?? null,
      cnaeDescription: (it as any).cnae_description ?? null,
    });
    const segment = segNorm.segment;
    const { score, label } = calculateProspectScore({
      website: it.website,
      email,
      linkedin_url: it.linkedin_url,
      instagram_url: it.instagram_url,
      phone: it.phone,
      estimated_employees: it.estimated_employees ?? null,
      segment,
      category: it.category,
      technologies: enrichment.technologies,
      decision_makers_count: 0,
    });
    if (enrichment.technologies.length > 0 || email) enriched++;
    await context.supabase.from("prospecting_results").insert({
      search_id: searchId,
      company_name: it.company_name,
      phone: it.phone,
      email,
      website: it.website,
      address: it.address,
      city: it.city,
      state: it.state,
      category: it.category,
      segment,
      rating: it.rating,
      reviews_count: it.reviews_count,
      linkedin_url: it.linkedin_url ?? null,
      instagram_url: it.instagram_url ?? null,
      google_maps_url: it.google_maps_url ?? null,
      followers: it.followers ?? null,
      bio: it.bio ?? null,
      estimated_employees: it.estimated_employees ?? null,
      technologies: enrichment.technologies,
      enrichment: enrichment.meta,
      raw: it.raw ?? it,
      score,
      score_label: label,
      status: "enriched",
    });
  }

  await context.supabase
    .from("prospecting_searches")
    .update({
      status: "done",
      apify_run_id: runId,
      total_found: items.length,
      total_enriched: enriched,
      total_qualified: items.length, // simplificado; recalculado abaixo
    })
    .eq("id", searchId);

  // Recompute total_qualified = morno+quente
  const { count: qual } = await context.supabase
    .from("prospecting_results")
    .select("id", { count: "exact", head: true })
    .eq("search_id", searchId)
    .in("score_label", ["morno", "quente"]);
  await context.supabase
    .from("prospecting_searches")
    .update({ total_qualified: qual ?? 0 })
    .eq("id", searchId);
}

export const enrichResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase
      .from("prospecting_results")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { detectTech } = await import("@/lib/tech-detect.server");
    const enrichment = r.website ? await detectTech(r.website) : { technologies: [], meta: {} };
    const email = r.email ?? (enrichment.meta as any)?.email ?? null;
    const { score, label } = calculateProspectScore({ ...r, email, technologies: enrichment.technologies });
    await context.supabase
      .from("prospecting_results")
      .update({
        technologies: enrichment.technologies,
        enrichment: enrichment.meta,
        email,
        score,
        score_label: label,
        status: "enriched",
      })
      .eq("id", data.id);
    return { ok: true, score, label };
  });

export const findDecisionMakers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { resultId: string }) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r } = await context.supabase
      .from("prospecting_results")
      .select("company_name, linkedin_url")
      .eq("id", data.resultId)
      .single();
    if (!r) throw new Error("Empresa não encontrada");
    // MVP: somente registra um placeholder “a buscar” se não houver LinkedIn.
    // Integração real com Apify LinkedIn People requer actor pago — deixar pronto sem dados falsos.
    return { ok: true, found: 0, note: "Configure o actor LinkedIn no Apify para ativar busca de decisores." };
  });

export const enrichSelected = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { ids: string[]; force?: boolean }) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("prospecting_results")
      .select(
        "id, organization_id, company_name, cnpj, website, email, phone, linkedin_url, instagram_url, google_maps_url, city, state, enrichment_status, enriched_at",
      )
      .in("id", data.ids);
    if (error) throw new Error(error.message);

    const { data: orgId } = await context.supabase.rpc("current_org_id");
    const { getProviderRuntimeConfig } = await import("@/lib/providers/runtime-config.server");
    const apifyCfg = orgId
      ? await getProviderRuntimeConfig({ organizationId: orgId, provider: "apify" })
      : null;
    const apifyToken = apifyCfg?.apiKey ?? null;
    const { enrichCompany, isFreshlyEnriched } = await import("@/lib/enrichment.server");

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    for (const r of rows ?? []) {
      if (!data.force && isFreshlyEnriched(r as any)) {
        skipped++;
        continue;
      }
      await context.supabase
        .from("prospecting_results")
        .update({ enrichment_status: "processing" })
        .eq("id", r.id);
      try {
        const out = await enrichCompany(r as any, { apifyToken, force: data.force });
        const patch: Record<string, any> = {
          ...out.patch,
          enrichment_status: out.status,
          enrichment_sources: out.sources_used,
          enrichment_errors: out.errors,
          enrichment_cost_cents: out.cost_cents,
          enriched_at: new Date().toISOString(),
          status: "enriched",
        };
        await context.supabase.from("prospecting_results").update(patch as any).eq("id", r.id);
        processed++;
        if (out.status === "failed") failed++;
      } catch (e) {
        failed++;
        await context.supabase
          .from("prospecting_results")
          .update({
            enrichment_status: "failed",
            enrichment_errors: [(e as Error).message],
            enriched_at: new Date().toISOString(),
          })
          .eq("id", r.id);
      }
    }
    return { processed, skipped, failed };
  });

export const listDecisionMakers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { resultId: string }) => z.object({ resultId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("prospecting_decision_makers")
      .select("*")
      .eq("result_id", data.resultId)
      .order("confidence", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const importResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    ids: string[];
    addToCadence?: boolean;
    agentId?: string | null;
    ownerId?: string | null;
    onDuplicate?: "update" | "ignore" | "ask";
    dryRun?: boolean;
  }) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        addToCadence: z.boolean().optional(),
        agentId: z.string().uuid().nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        onDuplicate: z.enum(["update", "ignore", "ask"]).optional(),
        dryRun: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("prospecting_results")
      .select("*")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    const ownerId = data.ownerId ?? context.userId;
    const onDup = data.onDuplicate ?? "ask";
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    const duplicates: Array<{ result_id: string; existing_lead_id: string; match_by: string; company: string }> = [];
    const importedLeadIds: string[] = [];

    function normName(s: string | null | undefined) {
      return (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    }
    function domainOf(url: string | null | undefined) {
      if (!url) return null;
      try { return new URL(url.startsWith("http") ? url : `http://${url}`).hostname.replace(/^www\./, "").toLowerCase(); }
      catch { return null; }
    }

    async function findExistingLead(r: any): Promise<{ id: string; by: string } | null> {
      // CNPJ → email → phone → domain → name+city
      if (r.cnpj) {
        const { data } = await context.supabase.from("leads").select("id").eq("cnpj", r.cnpj).maybeSingle();
        if ((data as any)?.id) return { id: (data as any).id, by: "cnpj" };
      }
      if (r.email) {
        const { data } = await context.supabase.from("leads").select("id").eq("email", r.email).maybeSingle();
        if ((data as any)?.id) return { id: (data as any).id, by: "email" };
      }
      if (r.phone) {
        const { data } = await context.supabase.from("leads").select("id").eq("telefone", r.phone).maybeSingle();
        if ((data as any)?.id) return { id: (data as any).id, by: "telefone" };
      }
      const dom = domainOf(r.website);
      if (dom) {
        const { data } = await context.supabase.from("leads").select("id, site").ilike("site", `%${dom}%`).limit(1);
        if ((data as any)?.[0]?.id) return { id: (data as any)[0].id, by: "dominio" };
      }
      if (r.company_name && r.city) {
        const { data } = await context.supabase
          .from("leads")
          .select("id, razao_social, nome_fantasia, cidade")
          .eq("cidade", r.city)
          .limit(50);
        const target = normName(r.company_name);
        const hit = ((data as any) ?? []).find((l: any) =>
          normName(l.razao_social) === target || normName(l.nome_fantasia) === target,
        );
        if (hit) return { id: hit.id, by: "nome+cidade" };
      }
      return null;
    }

    for (const r of rows ?? []) {
      const existing = await findExistingLead(r);
      if (existing) {
        if (data.dryRun || onDup === "ask") {
          duplicates.push({
            result_id: r.id, existing_lead_id: existing.id, match_by: existing.by,
            company: r.company_name ?? "",
          });
          continue;
        }
        if (onDup === "ignore") {
          skipped++;
          await context.supabase
            .from("prospecting_results")
            .update({ status: "imported", lead_id: existing.id })
            .eq("id", r.id);
          continue;
        }
        // update: preserve plataforma → só preenche buracos
        const patch: any = {
          site: r.website ?? undefined,
          telefone: r.phone ?? undefined,
          email: r.email ?? undefined,
          cnae: r.cnae ?? undefined,
          segmento: r.segment ?? r.category ?? undefined,
          cidade: r.city ?? undefined,
          estado: r.state ?? undefined,
          cnpj: r.cnpj ?? undefined,
          funcionarios_estimado: r.estimated_employees ?? undefined,
        };
        // strip undefined
        Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
        if (Object.keys(patch).length > 0) {
          await context.supabase.from("leads").update(patch).eq("id", existing.id);
        }
        updated++;
        importedLeadIds.push(existing.id);
        await context.supabase
          .from("prospecting_results")
          .update({ status: "imported", lead_id: existing.id })
          .eq("id", r.id);
        continue;
      }

      if (data.dryRun) { continue; }

      const payload: any = {
        razao_social: r.company_name,
        nome_fantasia: r.company_name,
        cnpj: r.cnpj,
        cnae: r.cnae,
        segmento: r.segment ?? r.category,
        cidade: r.city,
        estado: r.state,
        site: r.website,
        telefone: r.phone,
        email: r.email,
        funcionarios_estimado: r.estimated_employees,
        source: `prospecting:${r.search_id}`,
        prospecting_search_id: r.search_id,
        score: r.score,
        owner_id: ownerId,
        status: data.addToCadence ? "em_cadencia" : "coletado",
        agent_id: data.agentId ?? null,
      };
      const { data: lead, error: e2 } = await context.supabase
        .from("leads")
        .insert(payload)
        .select("id")
        .single();
      if (e2) {
        failed++;
        if (errors.length < 3) errors.push(e2.message);
        continue;
      }
      inserted++;
      importedLeadIds.push(lead.id);
      await context.supabase
        .from("prospecting_results")
        .update({ status: "imported", lead_id: lead.id })
        .eq("id", r.id);
    }
    if (rows?.[0]?.search_id) {
      await context.supabase
        .from("prospecting_searches")
        .update({ total_imported: inserted })
        .eq("id", rows[0].search_id);
    }
    return { inserted, updated, skipped, failed, errors, duplicates, leadIds: importedLeadIds };
  });

export const discardResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { ids: string[] }) => z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("prospecting_results")
      .update({ status: "discarded" })
      .in("id", data.ids);
    return { ok: true };
  });

export const getProspectingDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const [searches, results, imported, dms] = await Promise.all([
      context.supabase
        .from("prospecting_searches")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30),
      context.supabase
        .from("prospecting_results")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30),
      context.supabase
        .from("prospecting_results")
        .select("id", { count: "exact", head: true })
        .eq("status", "imported")
        .gte("created_at", since30),
      context.supabase
        .from("prospecting_decision_makers")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30),
    ]);
    const { data: bySource } = await context.supabase
      .from("prospecting_searches")
      .select("source_slug, total_found, total_imported")
      .gte("created_at", since30);
    const { data: bySegment } = await context.supabase
      .from("prospecting_results")
      .select("segment, score_label")
      .gte("created_at", since30)
      .limit(2000);
    return {
      empresas_encontradas: results.count ?? 0,
      empresas_importadas: imported.count ?? 0,
      decisores_encontrados: dms.count ?? 0,
      buscas_30d: searches.count ?? 0,
      taxa_enriquecimento:
        results.count && results.count > 0 ? Math.round(((imported.count ?? 0) / results.count) * 100) : 0,
      melhores_fontes: bySource ?? [],
      melhores_segmentos: bySegment ?? [],
    };
  });