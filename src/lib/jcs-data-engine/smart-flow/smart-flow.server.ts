/**
 * Smart Prospect Flow — orquestrador de alto nível (server-only).
 *
 * Fluxo:
 *   Pré-Score → filtro → (Orchestrator/Enrichment) → Score Final →
 *   Decisores (se elegível) → persistência.
 *
 * Tudo protegido por `jcs_data_engine_enabled`. Com a flag OFF,
 * runSmartFlow devolve { ok:false, reason:"feature_flag_off" } e NÃO toca em
 * providers, cache ou orquestrador. Nada aqui altera CRM, Leads, Cadências,
 * WhatsApp, Agenda, Email, Voice, Billing, Marketplace, Agentes, Produtos,
 * Casa dos Dados, Kipflow, Apify, Importações ou Webhooks.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isDataEngineEnabled } from "../cache.server";
import { runEnrichment } from "../orchestrator/orchestrator.server";
import { withTimeout } from "../orchestrator/timeout.server";
import {
  runUniversalIcpEngine,
  mapProspectingResultToUniversal,
  type IcpRule,
} from "@/lib/icp/universal-icp-engine";
import {
  classifyPreliminary,
  shouldEnrich,
  shouldFetchDecisionMakers,
  nextFlowStatusAfterPreScore,
  type SmartPreliminaryStatus,
  type SmartFlowStatus,
} from "./classifier";
import { aggregate, type SmartFlowRunOutcome, type SmartFlowAggregate } from "./metrics";

const OFF_REASON = "feature_flag_off";

/**
 * RC2.1 — Timeout máximo por empresa. Se o pipeline não terminar em N ms,
 * o batch encerra a execução, marca com `failure_reason` e continua para a
 * próxima empresa. Nenhuma linha fica em processing indefinidamente.
 */
export const SMART_FLOW_PER_COMPANY_TIMEOUT_MS = 90_000;

export type SmartFlowFailureReason =
  | "enrichment_timeout"
  | "provider_exhausted"
  | "budget_exhausted"
  | "missing_required_data"
  | "unexpected_error";

/** Classifica erro cru em motivo sanitizado (sem stack para vendedor). */
export function classifySmartFlowFailure(err: unknown): SmartFlowFailureReason {
  const msg = String((err as any)?.message ?? err ?? "").toLowerCase();
  if (msg.includes("timeout")) return "enrichment_timeout";
  if (msg.includes("budget") || msg.includes("saldo")) return "budget_exhausted";
  if (msg.includes("no_provider") || msg.includes("exhausted") || msg.includes("provider")) {
    return "provider_exhausted";
  }
  if (msg.includes("missing") || msg.includes("required")) return "missing_required_data";
  return "unexpected_error";
}

/**
 * RC2 — Finalização obrigatória do pipeline.
 *
 * Toda execução do Smart Flow deve terminar com uma linha em
 * `prospecting_company_scores` para que a UI consiga classificar a empresa
 * como Lead Bom / Em revisão / Fora do perfil. Sem essa linha, o painel de
 * resultados exibe "Em processamento" indefinidamente (bug RC1→RC2).
 */
async function persistFinalScore(params: {
  organization_id: string;
  prospecting_result_id: string;
  icp_id: string;
  score: number;
  matched: string[];
  missing: string[];
  disqualifying: string[];
  qualified_for_import: boolean;
  minimum_score: number;
}): Promise<void> {
  const { score, minimum_score, disqualifying } = params;
  const classification: "good_lead" | "review" | "outside_profile" =
    disqualifying.length > 0
      ? "outside_profile"
      : score >= minimum_score
        ? "good_lead"
        : score >= 60
          ? "review"
          : "outside_profile";
  try {
    await supabaseAdmin
      .from("prospecting_company_scores")
      .upsert(
        {
          organization_id: params.organization_id,
          prospecting_result_id: params.prospecting_result_id,
          icp_id: params.icp_id,
          icp_score: score,
          classification,
          matched_criteria: params.matched,
          missing_criteria: params.missing,
          disqualifying_reasons: params.disqualifying,
          qualified_for_import: params.qualified_for_import,
          calculated_at: new Date().toISOString(),
        } as any,
        { onConflict: "prospecting_result_id,icp_id" },
      );
  } catch (e) {
    console.error("[smart-flow] persistFinalScore failed", e);
  }
}

export interface SmartFlowInput {
  organization_id: string;
  prospecting_result_id: string;
  prospecting_search_id?: string | null;
  icp_id?: string | null;
  product_id?: string | null;
  /** Custo simulado (cents) que seria pago se enriquecêssemos sem filtro. */
  assumed_enrichment_cost_cents?: number;
  /** Injetável para testes: substitui runEnrichment. */
  __runEnrichment?: typeof runEnrichment;
}

export interface SmartFlowOutput {
  ok: boolean;
  reason?: string;
  preliminary_status?: SmartPreliminaryStatus;
  preliminary_score?: number;
  final_score?: number;
  smart_flow_status?: SmartFlowStatus;
  enriched?: boolean;
  fetched_decision_makers?: boolean;
  decision_makers_found?: number;
  credits_spent?: number;
  credits_avoided?: number;
  duration_ms?: number;
}

/** Resolve ICP direto ou via produto. */
async function resolveIcpId(input: {
  icp_id?: string | null;
  product_id?: string | null;
  organization_id: string;
}): Promise<string | null> {
  if (input.icp_id) return input.icp_id;
  if (input.product_id) {
    const { data } = await supabaseAdmin
      .from("product_catalog")
      .select("icp_id")
      .eq("id", input.product_id)
      .eq("organization_id", input.organization_id)
      .maybeSingle();
    return (data as any)?.icp_id ?? null;
  }
  // fallback: primeiro ICP ativo da org
  const { data } = await supabaseAdmin
    .from("ideal_customer_profiles")
    .select("id")
    .eq("organization_id", input.organization_id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

/** Roda o pipeline completo para 1 empresa. Idempotente por row. */
export async function runSmartFlow(input: SmartFlowInput): Promise<SmartFlowOutput> {
  const started = Date.now();

  const flag = await isDataEngineEnabled(input.organization_id);
  if (!flag) return { ok: false, reason: OFF_REASON };

  const runEnr = input.__runEnrichment ?? runEnrichment;

  // RC2 — variáveis compartilhadas para o finally() garantir persistência
  // de score mesmo em caminhos de erro/timeout/fallback.
  let resolvedIcpId: string | null = null;
  let minimumScore = 80;
  let finalScoreForPersist = 0;
  let matchedForPersist: string[] = [];
  let missingForPersist: string[] = [];
  let disqForPersist: string[] = [];
  let qualifiedForPersist = false;
  let persisted = false;
  let failureReason: SmartFlowFailureReason | null = null;
  let capturedError: unknown = null;

  try {

  // 1) Carrega row + ICP + regras.
  const [{ data: row, error: rErr }, icpId] = await Promise.all([
    supabaseAdmin
      .from("prospecting_results")
      .select("*")
      .eq("id", input.prospecting_result_id)
      .eq("organization_id", input.organization_id)
      .maybeSingle(),
    resolveIcpId({
      icp_id: input.icp_id ?? null,
      product_id: input.product_id ?? null,
      organization_id: input.organization_id,
    }),
  ]);
  if (rErr) return { ok: false, reason: `load_result_failed:${rErr.message}` };
  if (!row) return { ok: false, reason: "result_not_found" };
  if (!icpId) return { ok: false, reason: "icp_not_resolved" };
  resolvedIcpId = icpId;

  const [{ data: icp, error: iErr }, { data: rulesRows }] = await Promise.all([
    supabaseAdmin.from("ideal_customer_profiles").select("*").eq("id", icpId).single(),
    supabaseAdmin.from("icp_rules").select("*").eq("icp_id", icpId).order("order", { ascending: true }),
  ]);
  if (iErr) return { ok: false, reason: `load_icp_failed:${iErr.message}` };

  const preliminaryMin = (icp as any).preliminary_minimum_score ?? 70;
  minimumScore = (icp as any).minimum_score ?? 80;

  // marca início do fluxo
  await supabaseAdmin
    .from("prospecting_results")
    .update({ smart_flow_status: "aguardando_pre_score" } as any)
    .eq("id", input.prospecting_result_id);

  // 2) Pré-Score (não gasta crédito, ignora regras de enriquecimento).
  const preOut = runUniversalIcpEngine({
    icp: {
      id: (icp as any).id,
      minimum_score: (icp as any).minimum_score ?? 80,
      preliminary_minimum_score: preliminaryMin,
      criteria_json: (icp as any).criteria_json,
      weights_json: (icp as any).weights_json,
    },
    rules: (rulesRows ?? []) as IcpRule[],
    companies: [mapProspectingResultToUniversal(row as any)],
    mode: "preliminary",
  });
  const preScore = preOut.scores[0];
  const preliminary = classifyPreliminary({
    score: preScore?.score ?? 0,
    disqualifying: preScore?.disqualifying ?? [],
  });
  const nextStatus = nextFlowStatusAfterPreScore(preliminary);

  await supabaseAdmin
    .from("prospecting_results")
    .update({
      preliminary_score: preScore?.score ?? 0,
      preliminary_status: preliminary,
      pre_score_stage:
        preliminary === "descartado"
          ? "rejected_before_enrichment"
          : preliminary === "frio"
            ? "review_before_enrichment"
            : "eligible_for_enrichment",
      smart_flow_status: nextStatus,
      smart_flow_metadata: {
        preliminary: {
          score: preScore?.score ?? 0,
          matched: preScore?.matched ?? [],
          missing: preScore?.missing ?? [],
          disqualifying: preScore?.disqualifying ?? [],
          decided_at: new Date().toISOString(),
        },
      } as any,
    } as any)
    .eq("id", input.prospecting_result_id);

  // 3) Se não deve enriquecer: para aqui (créditos economizados).
  const assumedCost = Math.max(0, input.assumed_enrichment_cost_cents ?? 0);
  if (!shouldEnrich(preliminary)) {
    // RC2 — persiste score final baseado no pré-score para não deixar em processing.
    finalScoreForPersist = preScore?.score ?? 0;
    matchedForPersist = (preScore?.matched ?? []) as string[];
    missingForPersist = (preScore?.missing ?? []) as string[];
    disqForPersist = (preScore?.disqualifying ?? []) as string[];
    qualifiedForPersist = false;
    return {
      ok: true,
      preliminary_status: preliminary,
      preliminary_score: preScore?.score ?? 0,
      smart_flow_status: nextStatus,
      enriched: false,
      fetched_decision_makers: false,
      decision_makers_found: 0,
      credits_spent: 0,
      credits_avoided: assumedCost,
      duration_ms: Date.now() - started,
    };
  }

  // 4) Enriquecimento via orquestrador (respeita cache + budget + flag).
  await supabaseAdmin
    .from("prospecting_results")
    .update({ smart_flow_status: "enriquecendo" } as any)
    .eq("id", input.prospecting_result_id);

  const includeDecisionMakers = preliminary === "promissor";
  const enr = await runEnr({
    organization_id: input.organization_id,
    prospecting_search_id: input.prospecting_search_id ?? null,
    prospecting_result_id: input.prospecting_result_id,
    icp_id: icpId,
    product_id: input.product_id ?? null,
    cnpj: (row as any).cnpj ?? undefined,
    seed: {
      razao_social: (row as any).razao_social,
      nome_fantasia: (row as any).nome_fantasia,
      cidade: (row as any).cidade,
      uf: (row as any).uf ?? (row as any).estado,
    } as any,
    required_fields: includeDecisionMakers ? ["decision_makers"] : [],
  });

  // 5) Score final com dados enriquecidos (motor em modo final).
  const enrichedRowShape = {
    ...(row as any),
    ...(enr.company ?? {}),
  };
  const finalOut = runUniversalIcpEngine({
    icp: {
      id: (icp as any).id,
      minimum_score: (icp as any).minimum_score ?? 80,
      preliminary_minimum_score: preliminaryMin,
      criteria_json: (icp as any).criteria_json,
      weights_json: (icp as any).weights_json,
    },
    rules: (rulesRows ?? []) as IcpRule[],
    companies: [mapProspectingResultToUniversal(enrichedRowShape)],
    mode: "final",
  });
  const finalScore = finalOut.scores[0]?.score ?? 0;
  finalScoreForPersist = finalScore;
  matchedForPersist = (finalOut.scores[0]?.matched ?? []) as string[];
  missingForPersist = (finalOut.scores[0]?.missing ?? []) as string[];
  disqForPersist = (finalOut.scores[0]?.disqualifying ?? []) as string[];
  qualifiedForPersist = finalScore >= minimumScore && disqForPersist.length === 0;

  // 6) Decisores — só empresa aprovada.
  const dms = enr.decision_makers ?? [];
  const wantsDM = shouldFetchDecisionMakers(finalScore, preliminary);
  let dmStatus: "not_required" | "found" | "not_found" | "skipped" = "not_required";
  let dmSaved = 0;
  if (wantsDM) {
    if (dms.length > 0) {
      // Persiste apenas se ainda não existir (nunca duplica).
      const rows = dms.map((d: any) => ({
        organization_id: input.organization_id,
        prospecting_result_id: input.prospecting_result_id,
        nome: d.nome ?? d.name ?? null,
        cargo: d.cargo ?? d.title ?? null,
        email: d.email ?? null,
        telefone: d.telefone ?? d.phone ?? null,
        linkedin_url: d.linkedin_url ?? d.linkedin ?? null,
        source: d.source ?? "orchestrator",
      }));
      try {
        await supabaseAdmin.from("prospecting_decision_makers").upsert(rows as any, {
          onConflict: "prospecting_result_id,linkedin_url",
          ignoreDuplicates: true,
        });
      } catch {
        // fallback: insert em lote, ignorando erros de conflito
        try { await supabaseAdmin.from("prospecting_decision_makers").insert(rows as any); }
        catch { /* silencioso — nunca sobrepor */ }
      }
      dmStatus = "found";
      dmSaved = rows.length;
    } else {
      dmStatus = "not_found";
    }
  } else {
    dmStatus = "skipped";
  }

  const smartStatus: SmartFlowStatus =
    dmStatus === "found" ? "pronto_crm"
      : wantsDM ? "aguardando_decisor"
      : "enriquecido";

  await supabaseAdmin
    .from("prospecting_results")
    .update({
      smart_flow_status: smartStatus,
      decision_makers_status: dmStatus,
      smart_flow_metadata: {
        preliminary: {
          score: preScore?.score ?? 0,
          status: preliminary,
        },
        final: {
          score: finalScore,
          matched: finalOut.scores[0]?.matched ?? [],
          missing: finalOut.scores[0]?.missing ?? [],
          disqualifying: finalOut.scores[0]?.disqualifying ?? [],
          decided_at: new Date().toISOString(),
        },
        enrichment: {
          cost_cents: enr.cost_cents,
          duration_ms: enr.duration_ms,
          data_quality_score: enr.data_quality_score,
          contact_confidence: enr.contact_confidence,
          stopped_reason: enr.stopped_reason,
        },
        decision_makers: { requested: wantsDM, found: dms.length, saved: dmSaved },
      } as any,
    } as any)
    .eq("id", input.prospecting_result_id);

  return {
    ok: true,
    preliminary_status: preliminary,
    preliminary_score: preScore?.score ?? 0,
    final_score: finalScore,
    smart_flow_status: smartStatus,
    enriched: true,
    fetched_decision_makers: wantsDM,
    decision_makers_found: dms.length,
    credits_spent: enr.cost_cents ?? 0,
    credits_avoided: 0,
    duration_ms: Date.now() - started,
  };
  } catch (e) {
    capturedError = e;
    failureReason = classifySmartFlowFailure(e);
  } finally {
    // RC2 — garante que TODA execução termine com uma linha em
    // prospecting_company_scores, mesmo em timeout/erro. Sem isso, a UI
    // exibe "Em processamento" para sempre.
    if (resolvedIcpId && !persisted) {
      persisted = true;
      await persistFinalScore({
        organization_id: input.organization_id,
        prospecting_result_id: input.prospecting_result_id,
        icp_id: resolvedIcpId,
        score: finalScoreForPersist,
        matched: matchedForPersist,
        missing: missingForPersist,
        disqualifying: disqForPersist,
        qualified_for_import: qualifiedForPersist,
        minimum_score: minimumScore,
      });
      // RC2.1 — marca a linha como finalizada. Em caso de erro/timeout,
      // persiste failure_reason sanitizado em smart_flow_metadata para
      // que o Pipeline Visual e o Diagnóstico consigam explicar o motivo.
      try {
        const terminalStatus = failureReason
          ? (finalScoreForPersist > 0 ? "partial" : "failed")
          : "enriquecido";
        const update: any = { smart_flow_status: terminalStatus };
        if (failureReason) {
          update.smart_flow_metadata = {
            failure: {
              reason: failureReason,
              decided_at: new Date().toISOString(),
            },
          };
        }
        await supabaseAdmin
          .from("prospecting_results")
          .update(update)
          .eq("id", input.prospecting_result_id)
          .in("smart_flow_status", ["aguardando_pre_score", "enriquecendo"]);
      } catch { /* silencioso */ }
    }
  }

  // Retorno pós-catch — falha sanitizada para o batch continuar.
  return {
    ok: false,
    reason: failureReason ?? "unexpected_error",
    duration_ms: Date.now() - started,
  };
}

/** Roda em lote (sequencial p/ respeitar rate-limit de providers). */
export async function runSmartFlowBatch(input: {
  organization_id: string;
  prospecting_search_id?: string | null;
  prospecting_result_ids: string[];
  icp_id?: string | null;
  product_id?: string | null;
  assumed_enrichment_cost_cents?: number;
  target_good_leads?: number | null;
  max_companies_to_analyze?: number | null;
  max_intelligence_credits?: number | null;
  preliminary_minimum_score?: number | null;
  final_minimum_score?: number | null;
}): Promise<{ ok: boolean; reason?: string; aggregate: SmartFlowAggregate; per_result: SmartFlowOutput[] }> {
  const flag = await isDataEngineEnabled(input.organization_id);
  if (!flag) {
    return { ok: false, reason: OFF_REASON, aggregate: aggregate([]), per_result: [] };
  }

  // Resolve nomes de produto/ICP para o relatório auditável.
  const [{ data: prod }, { data: icpRow }] = await Promise.all([
    input.product_id
      ? supabaseAdmin.from("product_catalog").select("id,nome,icp_id").eq("id", input.product_id).maybeSingle()
      : Promise.resolve({ data: null }),
    input.icp_id
      ? supabaseAdmin.from("ideal_customer_profiles").select("id,name,minimum_score,preliminary_minimum_score").eq("id", input.icp_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Marca a busca como Smart Flow ANTES da execução (rastreabilidade).
  const cap = Math.max(1, Math.min(input.prospecting_result_ids.length, input.max_companies_to_analyze ?? input.prospecting_result_ids.length));
  const targetIds = input.prospecting_result_ids.slice(0, cap);
  const startedAt = new Date().toISOString();
  const maxCredits = input.max_intelligence_credits ?? null;
  if (input.prospecting_search_id) {
    try {
      await supabaseAdmin.from("prospecting_searches").update({
        product_id: input.product_id ?? null,
        icp_id: input.icp_id ?? null,
        target_good_leads: input.target_good_leads ?? null,
        max_companies_to_analyze: input.max_companies_to_analyze ?? null,
        max_intelligence_credits: maxCredits,
        preliminary_minimum_score: input.preliminary_minimum_score ?? null,
        final_minimum_score: input.final_minimum_score ?? null,
        smart_flow_enabled: true,
        smart_flow_status: "searching",
        smart_flow_started_at: startedAt,
      } as any).eq("id", input.prospecting_search_id).eq("organization_id", input.organization_id);
    } catch (e) {
      console.error("[smart-flow] persist search config failed", e);
    }
  }

  const outcomes: SmartFlowRunOutcome[] = [];
  const per_result: SmartFlowOutput[] = [];
  let goodSoFar = 0;
  let stopReason: string = "completed";
  for (const id of targetIds) {
    if (maxCredits != null && outcomes.reduce((s, o) => s + o.credits_spent, 0) >= maxCredits) {
      stopReason = "budget_reached";
      break;
    }
    if (input.target_good_leads != null && goodSoFar >= input.target_good_leads) {
      stopReason = "target_reached";
      break;
    }
    // RC2.1 — timeout duro por empresa. Se estourar, o finally() do
    // runSmartFlow já persistiu score e limpou status; aqui só coletamos
    // o resultado sanitizado e seguimos para a próxima.
    let r: SmartFlowOutput;
    try {
      r = await withTimeout(
        () => runSmartFlow({
          organization_id: input.organization_id,
          prospecting_search_id: input.prospecting_search_id ?? null,
          prospecting_result_id: id,
          icp_id: input.icp_id ?? null,
          product_id: input.product_id ?? null,
          assumed_enrichment_cost_cents: input.assumed_enrichment_cost_cents,
        }),
        SMART_FLOW_PER_COMPANY_TIMEOUT_MS,
        "smart_flow_company",
      );
    } catch (e) {
      r = { ok: false, reason: classifySmartFlowFailure(e) };
      // Garante que a linha órfã não fique em processing após timeout do wrapper.
      try {
        await supabaseAdmin
          .from("prospecting_results")
          .update({
            smart_flow_status: "failed",
            smart_flow_metadata: {
              failure: { reason: r.reason, decided_at: new Date().toISOString() },
            },
          } as any)
          .eq("id", id)
          .in("smart_flow_status", ["aguardando_pre_score", "enriquecendo"]);
      } catch { /* silencioso */ }
    }
    per_result.push(r);
    if (r.ok && r.preliminary_status) {
      outcomes.push({
        preliminary: r.preliminary_status,
        enriched: !!r.enriched,
        fetched_decision_makers: !!r.fetched_decision_makers,
        decision_makers_found: r.decision_makers_found ?? 0,
        credits_spent: r.credits_spent ?? 0,
        credits_avoided: r.credits_avoided ?? 0,
        duration_ms: r.duration_ms ?? 0,
      });
      if ((r.final_score ?? 0) >= (input.final_minimum_score ?? 80)) goodSoFar++;
    }
  }
  const agg = aggregate(outcomes);

  // persiste métricas na busca, se informada
  if (input.prospecting_search_id) {
    try {
      const finishedAt = new Date().toISOString();
      const smartStatus =
        stopReason === "target_reached" ? "target_reached"
        : stopReason === "budget_reached" ? "budget_reached"
        : per_result.length === 0 ? "failed"
        : per_result.some((x) => !x.ok) ? "partial"
        : "completed";
      await supabaseAdmin
        .from("prospecting_searches")
        .update({
          total_pre_scored: agg.total_pre_scored,
          total_promissores: agg.total_promissores,
          total_potenciais: agg.total_potenciais,
          total_frios: agg.total_frios,
          total_descartados_icp: agg.total_descartados_icp,
          credits_saved: agg.credits_saved,
          credits_spent: agg.credits_spent,
          avg_processing_ms: agg.avg_processing_ms,
          smart_flow_status: smartStatus,
          smart_flow_finished_at: finishedAt,
          smart_flow_stop_reason: stopReason,
          smart_flow_stats: {
            ...agg,
            product_id: input.product_id ?? null,
            product_name: (prod as any)?.nome ?? null,
            icp_id: input.icp_id ?? null,
            icp_name: (icpRow as any)?.name ?? null,
            preliminary_minimum_score: input.preliminary_minimum_score ?? (icpRow as any)?.preliminary_minimum_score ?? null,
            final_minimum_score: input.final_minimum_score ?? (icpRow as any)?.minimum_score ?? null,
            target_good_leads: input.target_good_leads ?? null,
            max_companies_to_analyze: input.max_companies_to_analyze ?? null,
            max_intelligence_credits: maxCredits,
            total_good_leads: goodSoFar,
            stop_reason: stopReason,
            started_at: startedAt,
            finished_at: finishedAt,
          } as any,
        } as any)
        .eq("id", input.prospecting_search_id)
        .eq("organization_id", input.organization_id);
    } catch (e) {
      console.error("[smart-flow] persist search metrics failed", e);
    }
  }
  return { ok: true, aggregate: agg, per_result };
}
