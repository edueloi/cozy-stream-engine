/**
 * Smart Prospect Flow — agregação pura de métricas do lote.
 * Nenhum I/O. Recebe os resultados individuais e devolve o objeto a persistir
 * em prospecting_searches (colunas dedicadas + smart_flow_stats jsonb).
 */
import type { SmartPreliminaryStatus } from "./classifier";

export interface SmartFlowRunOutcome {
  preliminary: SmartPreliminaryStatus;
  enriched: boolean;
  fetched_decision_makers: boolean;
  decision_makers_found: number;
  credits_spent: number;      // custo real do enriquecimento (cost_cents ou equivalente)
  credits_avoided: number;    // custo que teria sido pago se enriquecêssemos sem filtro
  duration_ms: number;
}

export interface SmartFlowAggregate {
  total_pre_scored: number;
  total_promissores: number;
  total_potenciais: number;
  total_frios: number;
  total_descartados_icp: number;
  total_enriched: number;
  total_dm_fetched: number;
  total_dm_found: number;
  credits_saved: number;
  credits_spent: number;
  avg_processing_ms: number;
  savings_pct: number; // 0..100
}

export function aggregate(outcomes: SmartFlowRunOutcome[]): SmartFlowAggregate {
  const agg: SmartFlowAggregate = {
    total_pre_scored: outcomes.length,
    total_promissores: 0,
    total_potenciais: 0,
    total_frios: 0,
    total_descartados_icp: 0,
    total_enriched: 0,
    total_dm_fetched: 0,
    total_dm_found: 0,
    credits_saved: 0,
    credits_spent: 0,
    avg_processing_ms: 0,
    savings_pct: 0,
  };
  if (outcomes.length === 0) return agg;

  let totalMs = 0;
  for (const o of outcomes) {
    if (o.preliminary === "promissor") agg.total_promissores++;
    else if (o.preliminary === "potencial") agg.total_potenciais++;
    else if (o.preliminary === "frio") agg.total_frios++;
    else agg.total_descartados_icp++;
    if (o.enriched) agg.total_enriched++;
    if (o.fetched_decision_makers) agg.total_dm_fetched++;
    agg.total_dm_found += o.decision_makers_found;
    agg.credits_saved += Math.max(0, o.credits_avoided);
    agg.credits_spent += Math.max(0, o.credits_spent);
    totalMs += o.duration_ms;
  }
  agg.avg_processing_ms = Math.round(totalMs / outcomes.length);
  const total = agg.credits_saved + agg.credits_spent;
  agg.savings_pct = total > 0 ? Math.round((agg.credits_saved / total) * 100) : 0;
  return agg;
}
