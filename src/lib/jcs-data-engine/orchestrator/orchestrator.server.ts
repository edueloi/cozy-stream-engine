import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emptyCompany, computeDataQualityScore, type NormalizedCompany } from "../normalizer";
import { buildEnrichmentPlan } from "./planner.server";
import { executeStep } from "./execution.server";
import { runParallel } from "./parallel.server";
import { shouldStop } from "./stop-condition.server";
import { contactConfidence, mergeCompany } from "./result-normalizer.server";
import { isDataEngineEnabled } from "../cache.server";
import { sanitize } from "./sanitizer";
import {
  createExecution, setPlan, setProcessing,
  completeExecution, failExecution,
  markCancelled, isCancelled, getExecutionRow,
} from "./executions-store.server";
import type { EnrichmentInput, EnrichmentPlan, EnrichmentResult, PlanStep, StepLog } from "./interfaces";

// Otimização local; jamais fonte de verdade. Persistência em enrichment_executions.
const cancelledLocal = new Set<string>();

export async function cancelPlan(execution_id: string): Promise<void> {
  cancelledLocal.add(execution_id);
  try { await markCancelled(execution_id); } catch (e) {
    console.error("[orchestrator] markCancelled failed", e);
  }
}

async function checkCancelled(execution_id: string): Promise<boolean> {
  if (cancelledLocal.has(execution_id)) return true;
  try {
    const c = await isCancelled(execution_id);
    if (c) cancelledLocal.add(execution_id);
    return c;
  } catch { return false; }
}

async function persistJob(params: {
  organization_id: string; plan: EnrichmentPlan; result: EnrichmentResult; execution_id: string;
}) {
  try {
    // Legado: mantemos escrita em enrichment_jobs durante a transição.
    await (supabaseAdmin.from("enrichment_jobs") as any).insert({
      organization_id: params.organization_id,
      status: params.result.ok ? (params.result.partial ? "partial" : "completed") : "failed",
      metadata: sanitize({
        execution_id: params.execution_id,
        plan: params.plan,
        result_summary: {
          cost_cents: params.result.cost_cents,
          duration_ms: params.result.duration_ms,
          data_quality_score: params.result.data_quality_score,
          contact_confidence: params.result.contact_confidence,
          stopped_reason: params.result.stopped_reason,
        },
      }),
    });
  } catch (e) {
    console.error("[orchestrator] persistJob failed", e);
  }
}

export async function runEnrichment(input: EnrichmentInput): Promise<EnrichmentResult> {
  const started = Date.now();
  const flag = await isDataEngineEnabled(input.organization_id);
  const execution_id = await createExecution({
    organization_id: input.organization_id,
    prospecting_search_id: input.prospecting_search_id ?? null,
    prospecting_result_id: input.prospecting_result_id ?? null,
    product_id: input.product_id ?? null,
    icp_id: input.icp_id ?? null,
    strategy: input.strategy ?? null,
  }).catch((e) => {
    console.error("[orchestrator] createExecution failed", e);
    return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  });
  const plan = await buildEnrichmentPlan(input);
  try { await setPlan(execution_id, plan); } catch { /* noop */ }

  if (!flag) {
    const r: EnrichmentResult = {
      ok: false, plan, company: null, decision_makers: [],
      data_quality_score: 0, contact_confidence: 0, cost_cents: 0,
      duration_ms: Date.now() - started, steps: [],
      stopped_reason: "feature_flag_off", partial: false,
    };
    try { await completeExecution(execution_id, "failed", r); } catch { /* noop */ }
    return r;
  }

  try { await setProcessing(execution_id); } catch { /* noop */ }
  const timeout_ms_per_step = input.timeout_ms_per_step ?? 15000;
  const max_parallel = input.max_parallel ?? 3;
  const min_quality = input.min_quality ?? 80;
  const budget_cents = input.budget_cents ?? null;
  const required = (input.required_fields ?? []).map(String);

  let company: NormalizedCompany = mergeCompany(null, (input.seed ?? null) as any, "seed");
  if (input.cnpj) (company as any).cnpj = input.cnpj.replace(/\D/g, "");
  if (!company.source) company = { ...emptyCompany("orchestrator"), ...company };

  const allSteps: StepLog[] = [];
  let spent = 0;
  let stopped_reason: string | undefined;

  const groups = new Map<number, PlanStep[]>();
  for (const s of plan.ordem_execucao) {
    const list = groups.get(s.parallel_group) ?? [];
    list.push(s);
    groups.set(s.parallel_group, list);
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);

  outer: for (const [, steps] of sortedGroups) {
    if (await checkCancelled(execution_id)) { stopped_reason = "cancelled"; break; }
    const stop = shouldStop(company, {
      min_quality, required_fields: required, budget_cents,
      spent_cents: spent, feature_flag_ok: true,
    });
    if (stop.stop) { stopped_reason = stop.reason; break; }

    const results = await runParallel(
      steps,
      async (step) => executeStep({
        organization_id: input.organization_id, step,
        cnpj: company.cnpj, timeout_ms: timeout_ms_per_step,
        ctx: {
          prospecting_result_id: input.prospecting_result_id ?? null,
          prospecting_search_id: input.prospecting_search_id ?? null,
        },
        isCancelled: () => checkCancelled(execution_id),
      }),
      max_parallel,
    );

    for (const r of results) {
      allSteps.push(...r.logs);
      spent += r.cost_cents;
      if (r.data) company = mergeCompany(company, r.data, r.provider ?? "orchestrator");
      if (r.decision_makers?.length) {
        company = mergeCompany(company, { decision_makers: r.decision_makers } as any);
      }
      if (await checkCancelled(execution_id)) { stopped_reason = "cancelled"; break outer; }
      const s2 = shouldStop(company, {
        min_quality, required_fields: required, budget_cents,
        spent_cents: spent, feature_flag_ok: true,
      });
      if (s2.stop) { stopped_reason = s2.reason; break outer; }
    }
  }

  const dqs = computeDataQualityScore(company);
  const cc = contactConfidence(company);
  const partial =
    required.some((f) => (company as any)[f] == null || (company as any)[f] === "") ||
    allSteps.some((s) => !s.ok);

  const result: EnrichmentResult = {
    ok: true, plan, company,
    decision_makers: company.decision_makers ?? [],
    data_quality_score: dqs, contact_confidence: cc,
    cost_cents: spent, duration_ms: Date.now() - started,
    steps: allSteps, stopped_reason, partial,
  };

  const finalStatus =
    stopped_reason === "cancelled" ? "cancelled" :
    stopped_reason === "budget_exhausted" ? "budget_exhausted" :
    stopped_reason === "quality_reached" ? "quality_reached" :
    partial ? "partial" : "completed";
  try { await completeExecution(execution_id, finalStatus, result); }
  catch (e) { await failExecution(execution_id, e).catch(() => undefined); }

  await persistJob({
    organization_id: input.organization_id, plan, result, execution_id,
  });

  if (input.prospecting_result_id) {
    try {
      await (supabaseAdmin.from("prospecting_results") as any)
        .update({ data_quality_score: dqs, contact_confidence: cc })
        .eq("id", input.prospecting_result_id)
        .eq("organization_id", input.organization_id);
    } catch (e) {
      console.error("[orchestrator] update prospecting_results failed", e);
    }
  }

  return { ...result, plan: { ...plan }, /* execution_id embutido para consumidores */ } as EnrichmentResult & { execution_id?: string };
}

export async function retryPlanRun(input: EnrichmentInput): Promise<EnrichmentResult> {
  return runEnrichment(input);
}

export { buildEnrichmentPlan, getExecutionRow };