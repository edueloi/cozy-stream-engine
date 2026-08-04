import { getAdapter } from "../registry.server";
import { readCache, writeCache, logUsage, checkBudget } from "../cache.server";
import { withRetry } from "./retry.server";
import { withTimeout } from "./timeout.server";
import { nextFallback } from "./fallback.server";
import { acquireSlot, releaseSlot, trip429 } from "./rate-limiter.server";
import { classifyError } from "./error-classifier";
import type { PlanStep, StepLog } from "./interfaces";
import type { NormalizedCompany, NormalizedDecisionMaker } from "../normalizer";

export interface StepExecutionResult {
  ok: boolean;
  provider?: string;
  data: Partial<NormalizedCompany> | null;
  decision_makers?: NormalizedDecisionMaker[];
  logs: StepLog[];
  cost_cents: number;
  cache_hit: boolean;
}

async function callCapability(
  organization_id: string,
  provider: string,
  capability: string,
  cnpj: string | null,
): Promise<Partial<NormalizedCompany> | NormalizedDecisionMaker[] | null> {
  const a = getAdapter(provider, organization_id);
  if (!a) return null;
  switch (capability) {
    case "company_enrichment":
    case "company_website":
    case "company_email":
    case "company_phone":
    case "company_linkedin":
    case "company_instagram":
    case "social_profiles":
    case "contact_enrichment":
      if (!cnpj || !a.companyEnrichment) return null;
      return await a.companyEnrichment({ cnpj });
    case "decision_makers":
    case "professional_profile":
      if (!cnpj || !a.findDecisionMakers) return [];
      return await a.findDecisionMakers({ cnpj });
    case "company_search":
      if (!cnpj || !a.companySearch) return null;
      return (await a.companySearch({ cnpj }))[0] ?? null;
    default:
      return null;
  }
}

export async function executeStep(params: {
  organization_id: string;
  step: PlanStep;
  cnpj: string | null;
  timeout_ms: number;
  ctx: { prospecting_result_id?: string | null; prospecting_search_id?: string | null };
  isCancelled?: () => Promise<boolean>;
}): Promise<StepExecutionResult> {
  const { organization_id, step, cnpj, timeout_ms, ctx } = params;
  const logs: StepLog[] = [];
  const tried = new Set<string>();
  let cost = 0;

  if (step.cache_key) {
    const cached = await readCache({ organization_id, ...step.cache_key });
    if (cached != null) {
      logs.push({
        capability: step.capability, provider: "cache", attempt: 0,
        cache: "hit", ok: true, latency_ms: 0,
      });
      await logUsage({
        organization_id, provider: "cache", operation: step.capability,
        success: true, metadata: { cache: "hit" },
        prospecting_result_id: ctx.prospecting_result_id ?? undefined,
        prospecting_search_id: ctx.prospecting_search_id ?? undefined,
      });
      const isPeople = step.capability === "decision_makers" || step.capability === "professional_profile";
      return {
        ok: true, provider: "cache",
        data: isPeople ? null : (cached as Partial<NormalizedCompany>),
        decision_makers: isPeople ? (cached as NormalizedDecisionMaker[]) : undefined,
        logs, cost_cents: 0, cache_hit: true,
      };
    }
  }

  let providerToTry: string | null = step.providers[0] ?? null;
  let attemptIdx = 0;
  while (providerToTry) {
    if (params.isCancelled && await params.isCancelled()) {
      logs.push({
        capability: step.capability, provider: providerToTry, attempt: attemptIdx,
        cache: "skip", ok: false, latency_ms: 0, stopped: "cancelled",
      });
      return { ok: false, data: null, logs, cost_cents: cost, cache_hit: false };
    }
    tried.add(providerToTry);
    attemptIdx++;
    const budget = await checkBudget({ organization_id, provider: providerToTry });
    if (!budget.ok) {
      logs.push({
        capability: step.capability, provider: providerToTry, attempt: attemptIdx,
        cache: "skip", ok: false, latency_ms: 0, error: budget.reason, stopped: "budget",
      });
      providerToTry = nextFallback(step.providers, tried);
      continue;
    }

    const rl = await acquireSlot({ organization_id, provider: providerToTry });
    if (!rl.ok) {
      logs.push({
        capability: step.capability, provider: providerToTry, attempt: attemptIdx,
        cache: "skip", ok: false, latency_ms: rl.wait_ms,
        error: `rate_limit_${rl.reason}`, stopped: "provider_rate_limited",
      });
      providerToTry = nextFallback(step.providers, tried);
      continue;
    }

    const started = Date.now();
    const currentProvider = providerToTry;
    const outcome = await withRetry(
      () => withTimeout(
        () => callCapability(organization_id, currentProvider, step.capability, cnpj),
        timeout_ms, `${currentProvider}:${step.capability}`,
      ),
    );
    const latency = Date.now() - started;
    await releaseSlot(organization_id, currentProvider);
    if (!outcome.ok) {
      const c = outcome.classified;
      if (c.status === 429) await trip429(organization_id, currentProvider);
    }

    if (outcome.ok && outcome.value != null) {
      cost += step.estimated_cost;
      logs.push({
        capability: step.capability, provider: currentProvider, attempt: outcome.attempts,
        cache: "miss", ok: true, latency_ms: latency,
        ...(rl.wait_ms > 0 ? { fallback_from: `rate_limit_wait_${rl.wait_ms}ms` } : {}),
      });
      await logUsage({
        organization_id, provider: currentProvider, operation: step.capability,
        success: true, estimated_cost: step.estimated_cost,
        metadata: { latency_ms: latency, attempts: outcome.attempts, rate_limit_wait_ms: rl.wait_ms },
        prospecting_result_id: ctx.prospecting_result_id ?? undefined,
        prospecting_search_id: ctx.prospecting_search_id ?? undefined,
      });
      const isPeople = step.capability === "decision_makers" || step.capability === "professional_profile";
      const value = outcome.value as any;
      if (step.cache_key) {
        await writeCache({
          organization_id, ...step.cache_key, value, provider: currentProvider,
        });
      }
      return {
        ok: true, provider: currentProvider,
        data: isPeople ? null : (value as Partial<NormalizedCompany>),
        decision_makers: isPeople ? (value as NormalizedDecisionMaker[]) : undefined,
        logs, cost_cents: cost, cache_hit: false,
      };
    }

    const classified = outcome.ok ? classifyError(new Error("empty_result")) : outcome.classified;
    logs.push({
      capability: step.capability, provider: currentProvider, attempt: outcome.attempts,
      cache: "miss", ok: false, latency_ms: latency,
      error: outcome.ok ? "empty_result" : outcome.error.message,
      fallback_from: currentProvider,
    });
    await logUsage({
      organization_id, provider: currentProvider, operation: step.capability,
      success: false, skipped_reason: "provider_error",
      metadata: {
        latency_ms: latency, attempts: outcome.attempts,
        error_category: classified.category, error_reason: classified.reason,
      },
      prospecting_result_id: ctx.prospecting_result_id ?? undefined,
      prospecting_search_id: ctx.prospecting_search_id ?? undefined,
    });
    // Erros terminais nunca retentam o mesmo provider; sempre vão para fallback.
    providerToTry = nextFallback(step.providers, tried);
  }

  return { ok: false, data: null, logs, cost_cents: cost, cache_hit: false };
}