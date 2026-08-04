// JCS Data Engine — Orchestrator interfaces.
// Puro (sem imports server-only) para poder ser referenciado por functions.ts
// e por testes. Todos os tipos são aditivos.

import type { NormalizedCompany, NormalizedDecisionMaker } from "../normalizer";

export type OrchestratorStrategy =
  | "CheapestFirst"
  | "HighestQualityFirst"
  | "PriorityOrder"
  | "Balanced";

export interface EnrichmentInput {
  organization_id: string;
  product_id?: string | null;
  icp_id?: string | null;
  prospecting_search_id?: string | null;
  prospecting_result_id?: string | null;
  cnpj?: string | null;
  seed?: Partial<NormalizedCompany> | null;
  strategy?: OrchestratorStrategy;
  budget_cents?: number | null;
  min_quality?: number | null; // 0..100
  required_fields?: Array<keyof NormalizedCompany>;
  optional_fields?: Array<keyof NormalizedCompany>;
  timeout_ms_per_step?: number;
  max_parallel?: number;
}

export interface PlanStep {
  capability: string;
  providers: string[]; // ordenados conforme strategy; primeiro é o preferido
  fields_target: string[];
  parallel_group: number; // steps do mesmo grupo podem rodar em paralelo
  cache_key?: { key_type: string; key_value: string; field: string };
  estimated_cost: number;
  required: boolean;
}

export interface EnrichmentPlan {
  organization_id: string;
  cnpj: string | null;
  strategy: OrchestratorStrategy;
  campos_existentes: string[];
  campos_faltantes: string[];
  criterios_obrigatorios: string[];
  criterios_pendentes: string[];
  providers_selecionados: string[];
  ordem_execucao: PlanStep[];
  custo_estimado: number;
  tempo_estimado_ms: number;
  condicoes_de_parada: string[];
  feature_flag_ok: boolean;
  reason_if_blocked?: string;
}

export interface StepLog {
  capability: string;
  provider: string;
  attempt: number;
  cache: "hit" | "miss" | "skip";
  ok: boolean;
  latency_ms: number;
  error?: string;
  fallback_from?: string;
  stopped?: string;
}

export interface EnrichmentResult {
  ok: boolean;
  plan: EnrichmentPlan;
  company: NormalizedCompany | null;
  decision_makers: NormalizedDecisionMaker[];
  data_quality_score: number;
  contact_confidence: number;
  cost_cents: number;
  duration_ms: number;
  steps: StepLog[];
  stopped_reason?: string;
  partial: boolean;
}