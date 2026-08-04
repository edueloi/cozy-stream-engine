/**
 * Release 1.3.9 — Mapper único para exibição de ICP no frontend.
 *
 * Contrato: nenhuma UI deve montar listas de matched/missing/disqualified
 * "por conta própria". Toda tela consome o resultado deste mapper.
 *
 * Regras críticas (item 4 e 6 do brief 1.3.9):
 *   - Um critério NUNCA aparece em mais de um bucket.
 *   - `unknown` != `disqualified`. Dado ausente é sempre unknown.
 *   - `disqualified` só existe quando o dado está presente e bate uma
 *     regra proibida/negativa comprovada.
 */
import type { CriterionEvaluation, UniversalIcpScore } from "./universal-icp-engine";

export interface IcpDisplayView {
  score: number;
  rating: UniversalIcpScore["rating"];
  matched: CriterionEvaluation[];
  not_matched: CriterionEvaluation[];
  unknown: CriterionEvaluation[];
  disqualified: CriterionEvaluation[];
  pending_enrichment: CriterionEvaluation[];
  has_pending_enrichment: boolean;
  insufficient_data: boolean;
  qualified_for_import: boolean;
  summary_label:
    | "Lead Bom"
    | "Lead Potencial"
    | "Lead Frio"
    | "Fora do perfil"
    | "Em processamento"
    | "Dados insuficientes";
}

/**
 * Deriva a view única exibida na UI a partir do resultado oficial do engine.
 * O engine já preenche `evaluations` com estados normalizados 4-way; aqui
 * apenas agrupamos e derivamos o rótulo humano.
 */
export function mapIcpEvaluationForDisplay(
  score: UniversalIcpScore,
  opts: { minimumScore?: number; enrichmentFinished?: boolean } = {},
): IcpDisplayView {
  const evals = score.evaluations ?? [];
  const matched = evals.filter((e) => e.state === "matched" && !e.pending_enrichment);
  const not_matched = evals.filter((e) => e.state === "not_matched");
  const unknown = evals.filter((e) => e.state === "unknown" && !e.pending_enrichment);
  const disqualified = evals.filter((e) => e.state === "disqualified");
  const pending_enrichment = evals.filter((e) => e.pending_enrichment);

  const enrichmentFinished = opts.enrichmentFinished !== false; // default true

  // Release 1.4.0 — Classificação comercial:
  //   Só é "Fora do perfil" com desqualificador real OU score < 40.
  //   Campos desconhecidos não geram "Fora do perfil".
  let summary_label: IcpDisplayView["summary_label"];
  if (disqualified.length > 0) {
    summary_label = "Fora do perfil";
  } else if (!enrichmentFinished || pending_enrichment.length > 0) {
    summary_label = "Em processamento";
  } else if (score.score >= 80) {
    summary_label = "Lead Bom";
  } else if (score.score >= 60) {
    summary_label = "Lead Potencial";
  } else if (score.score >= 40) {
    summary_label = "Lead Frio";
  } else if (score.insufficient_data) {
    summary_label = "Dados insuficientes";
  } else {
    summary_label = "Fora do perfil";
  }

  return {
    score: score.score,
    rating: score.rating,
    matched,
    not_matched,
    unknown,
    disqualified,
    pending_enrichment,
    has_pending_enrichment: score.has_pending_enrichment ?? pending_enrichment.length > 0,
    insufficient_data: score.insufficient_data ?? false,
    qualified_for_import: score.qualified_for_import,
    summary_label,
  };
}

/** Classifica uma linha `prospecting_company_scores` (persistido) para exibição em abas. */
export function classifyPersistedScore(row: {
  icp_score?: number | null;
  classification?: string | null;
  disqualifying_reasons?: string[] | null;
  missing_criteria?: string[] | null;
  matched_criteria?: string[] | null;
} | null | undefined, opts: { minimumScore?: number } = {}): IcpDisplayView["summary_label"] {
  if (!row) return "Em processamento";
  const score = Number(row.icp_score ?? 0);
  const disq = (row.disqualifying_reasons ?? []).length;
  const matched = (row.matched_criteria ?? []).length;
  const missing = (row.missing_criteria ?? []).length;

  if (disq > 0) return "Fora do perfil";
  if (matched === 0 && missing === 0 && score === 0) return "Em processamento";
  if (score >= 80) return "Lead Bom";
  if (score >= 60) return "Lead Potencial";
  if (score >= 40) return "Lead Frio";
  if (score > 0) return "Fora do perfil";
  return "Em processamento";
}