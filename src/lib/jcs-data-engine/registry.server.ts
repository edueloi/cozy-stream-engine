// JCS Data Engine — Provider Registry. Server-only.
//
// Ponto de entrada único para qualquer chamada a Provider dentro do Data Engine.
// Aplica na ordem: feature flag → credencial ativa → provider habilitado →
// cache válido → limite diário/mensal (budget) → execução → normalização →
// cache-write → usage log. Se qualquer guarda falhar, NÃO consome créditos
// e apenas registra o skip em provider_usage_events.
//
// A tela de Prospecção continua chamando Casa dos Dados/Apify diretamente
// como hoje. Este registry só é usado por código que optar por passar pelo
// Data Engine (ex.: futuras funções de enriquecimento inteligente).

import type { NormalizedCompany, NormalizedDecisionMaker } from "./normalizer";
import type { ProviderAdapter } from "./providers/types";
import { KipflowAdapter, createKipflowAdapter } from "./providers/kipflow.adapter.server";
import {
  checkBudget,
  isDataEngineEnabled,
  logUsage,
  readCache,
  writeCache,
} from "./cache.server";

const ADAPTERS: Record<string, ProviderAdapter> = {
  [KipflowAdapter.name]: KipflowAdapter,
};

/**
 * Resolve o adapter para o provider. Quando `organizationId` é informado,
 * retorna um adapter com credencial da organização (via resolver central).
 * Sem orgId retorna o adapter legado (fallback env), preservando compat.
 */
export function getAdapter(name: string, organizationId?: string | null): ProviderAdapter | null {
  if (name === "kipflow") return createKipflowAdapter(organizationId ?? null);
  return ADAPTERS[name] ?? null;
}

export function listAdapters(): ProviderAdapter[] {
  return Object.values(ADAPTERS);
}

export interface CallContext {
  organization_id: string;
  prospecting_result_id?: string;
  prospecting_search_id?: string;
}

export interface CallOutcome<T> {
  ok: boolean;
  data: T | null;
  cache_hit: boolean;
  skipped_reason?: string;
  error?: string;
  provider: string;
}

// Fluxo padrão de guarda + execução + cache + log.
async function runGuarded<T>(params: {
  provider: string;
  operation: string;
  ctx: CallContext;
  cacheKey?: { key_type: string; key_value: string; field: string; ttl_ms?: number };
  exec: () => Promise<T | null>;
  estimated_cost?: number;
}): Promise<CallOutcome<T>> {
  const { provider, operation, ctx } = params;

  // 1. Feature flag
  if (!(await isDataEngineEnabled(ctx.organization_id))) {
    await logUsage({
      organization_id: ctx.organization_id,
      provider,
      operation,
      success: false,
      skipped_reason: "feature_flag_off",
      estimated_cost_avoided: params.estimated_cost,
      prospecting_result_id: ctx.prospecting_result_id,
      prospecting_search_id: ctx.prospecting_search_id,
    });
    return { ok: false, data: null, cache_hit: false, skipped_reason: "feature_flag_off", provider };
  }

  // 2. Cache
  if (params.cacheKey) {
    const cached = await readCache({ organization_id: ctx.organization_id, ...params.cacheKey });
    if (cached != null) {
      await logUsage({
        organization_id: ctx.organization_id,
        provider,
        operation,
        success: true,
        estimated_cost_avoided: params.estimated_cost,
        prospecting_result_id: ctx.prospecting_result_id,
        prospecting_search_id: ctx.prospecting_search_id,
        metadata: { cache: "hit" },
      });
      return { ok: true, data: cached as T, cache_hit: true, provider };
    }
  }

  // 3. Credential + budget
  const budget = await checkBudget({ organization_id: ctx.organization_id, provider });
  if (!budget.ok) {
    await logUsage({
      organization_id: ctx.organization_id,
      provider,
      operation,
      success: false,
      skipped_reason: budget.reason,
      estimated_cost_avoided: params.estimated_cost,
      prospecting_result_id: ctx.prospecting_result_id,
      prospecting_search_id: ctx.prospecting_search_id,
    });
    return { ok: false, data: null, cache_hit: false, skipped_reason: budget.reason, provider };
  }

  // 4. Execute
  const started = Date.now();
  try {
    const data = await params.exec();
    const elapsed = Date.now() - started;

    if (data != null && params.cacheKey) {
      await writeCache({
        organization_id: ctx.organization_id,
        ...params.cacheKey,
        value: data as any,
        provider,
      });
    }
    await logUsage({
      organization_id: ctx.organization_id,
      provider,
      operation,
      success: true,
      estimated_cost: params.estimated_cost,
      prospecting_result_id: ctx.prospecting_result_id,
      prospecting_search_id: ctx.prospecting_search_id,
      metadata: { cache: "miss", latency_ms: elapsed },
    });
    return { ok: true, data, cache_hit: false, provider };
  } catch (e) {
    const err = (e as Error).message;
    await logUsage({
      organization_id: ctx.organization_id,
      provider,
      operation,
      success: false,
      skipped_reason: "provider_error",
      prospecting_result_id: ctx.prospecting_result_id,
      prospecting_search_id: ctx.prospecting_search_id,
      metadata: { error: err, latency_ms: Date.now() - started },
    });
    return { ok: false, data: null, cache_hit: false, error: err, provider };
  }
}

// --- API pública do Registry ---

export async function companyEnrichment(
  ctx: CallContext,
  input: { cnpj: string },
  provider = "kipflow",
): Promise<CallOutcome<NormalizedCompany>> {
  const a = getAdapter(provider, ctx.organization_id);
  if (!a?.companyEnrichment) {
    return { ok: false, data: null, cache_hit: false, skipped_reason: "no_capability", provider };
  }
  const cnpj = input.cnpj.replace(/\D/g, "");
  return runGuarded<NormalizedCompany>({
    provider,
    operation: "company_enrichment",
    ctx,
    cacheKey: { key_type: "cnpj", key_value: cnpj, field: "company" },
    exec: () => a.companyEnrichment!({ cnpj }),
    estimated_cost: 0.05,
  });
}

export async function findDecisionMakers(
  ctx: CallContext,
  input: { cnpj: string; limit?: number },
  provider = "kipflow",
): Promise<CallOutcome<NormalizedDecisionMaker[]>> {
  const a = getAdapter(provider, ctx.organization_id);
  if (!a?.findDecisionMakers) {
    return { ok: false, data: null, cache_hit: false, skipped_reason: "no_capability", provider };
  }
  const cnpj = input.cnpj.replace(/\D/g, "");
  return runGuarded<NormalizedDecisionMaker[]>({
    provider,
    operation: "decision_makers",
    ctx,
    cacheKey: { key_type: "cnpj", key_value: cnpj, field: "decision_maker" },
    exec: () => a.findDecisionMakers!({ cnpj, limit: input.limit }),
    estimated_cost: 0.1,
  });
}

export async function health(provider: string) {
  const a = getAdapter(provider);
  if (!a) return null;
  return a.health();
}

// Benchmark: registra métricas comparativas quando dois providers respondem
// à mesma empresa. Guarda o histórico em provider_usage_events.metadata.
export async function recordBenchmark(params: {
  organization_id: string;
  cnpj: string;
  results: Array<{
    provider: string;
    latency_ms: number;
    completeness: number; // 0..100
    contacts: number;
    decision_makers: number;
    emails: number;
    phones: number;
    data_quality: number;
    confidence: number;
    credits: number;
  }>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("provider_usage_events").insert(
    params.results.map((r) => ({
      organization_id: params.organization_id,
      provider: r.provider,
      operation: "benchmark",
      success: true,
      units: 0,
      metadata: { cnpj: params.cnpj, ...r } as any,
    })),
  );
}