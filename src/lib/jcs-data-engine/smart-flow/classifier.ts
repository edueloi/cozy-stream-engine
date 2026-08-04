/**
 * Smart Prospect Flow — classificador puro por score.
 * Sem dependência de banco, sem I/O. Testável isoladamente.
 */

export type SmartPreliminaryStatus =
  | "promissor"   // >= 80
  | "potencial"   // 60..79
  | "frio"        // 40..59
  | "descartado"; // < 40 ou desqualificador

export type SmartFlowStatus =
  | "aguardando_pre_score"
  | "pre_score_concluido"
  | "descartado_pelo_icp"
  | "aguardando_enriquecimento"
  | "enriquecendo"
  | "enriquecido"
  | "aguardando_decisor"
  | "pronto_crm";

export type DecisionMakersStatus =
  | "not_required"
  | "pending"
  | "found"
  | "not_found"
  | "skipped";

export interface ClassifyInput {
  score: number;
  disqualifying?: string[] | null;
}

/** Converte score preliminar em rótulo humano. */
export function classifyPreliminary(input: ClassifyInput): SmartPreliminaryStatus {
  const dq = input.disqualifying ?? [];
  if (dq.length > 0) return "descartado";
  const s = Number.isFinite(input.score) ? input.score : 0;
  if (s >= 80) return "promissor";
  if (s >= 60) return "potencial";
  if (s >= 40) return "frio";
  return "descartado";
}

/** Deve chamar enriquecimento pago? Regra principal do PR03. */
export function shouldEnrich(status: SmartPreliminaryStatus): boolean {
  return status === "promissor" || status === "potencial";
}

/** Deve buscar decisores? Só empresa aprovada no score FINAL. */
export function shouldFetchDecisionMakers(
  finalScore: number,
  preliminary: SmartPreliminaryStatus,
): boolean {
  if (preliminary === "promissor") return true;
  if (preliminary === "frio" || preliminary === "descartado") return false;
  return Number.isFinite(finalScore) && finalScore >= 80;
}

/** Próximo status do fluxo com base no resultado do pré-score. */
export function nextFlowStatusAfterPreScore(status: SmartPreliminaryStatus): SmartFlowStatus {
  if (status === "descartado") return "descartado_pelo_icp";
  if (status === "frio") return "pre_score_concluido"; // pausa; não enriquece
  return "aguardando_enriquecimento";
}
