/**
 * Universal ICP Engine (Fase B)
 * -----------------------------
 * Motor único que classifica empresas de qualquer fonte de prospecção.
 *
 * Entrada:
 *   - Um ICP (com regras dinâmicas em `icp_rules` OU legado `criteria_json`/`weights_json`)
 *   - Uma lista de empresas no formato `ProspectSourceResult`
 *
 * Saída:
 *   - Para cada empresa: { score 0-100, rating, reasons[], breakdown[] }
 *
 * Regras de projeto:
 *   - 100% desacoplado de UI e de banco (funções puras).
 *   - Não altera nenhum fluxo existente. É aditivo.
 *   - Mantém compatibilidade com ICPs antigos via fallback.
 */

import {
  calculateIcpScore,
  type IcpCriteria,
  type IcpWeights,
} from "@/lib/icp-scorer";

// ---------------------------------------------------------------------------
// Contrato universal de fonte de prospecção
// Qualquer integração futura (Casa dos Dados, Google Maps, LinkedIn, Apollo,
// CSV, API própria, Webhook, etc.) deve normalizar seu retorno para este shape.
// ---------------------------------------------------------------------------
export interface ProspectSourceResult {
  id: string;
  company_name?: string | null;
  cnpj?: string | null;
  city?: string | null;
  state?: string | null;
  porte?: string | null;
  estimated_employees?: number | null;
  capital_social?: number | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  instagram_url?: string | null;
  cnae?: string | null;
  cnaes_secundarios?: string[] | null;
  segment?: string | null;
  category?: string | null;
  situacao_cadastral?: string | null;
  data_abertura?: string | null;
  technologies?: string[] | null;
  decision_maker?: string | null;
  decision_maker_role?: string | null;
  source?: string | null; // ex.: 'casa_dos_dados', 'google_maps', 'csv'
  raw?: any;
  // campos extras aceitos livremente
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Tipos de saída
// ---------------------------------------------------------------------------
export type IcpRating = "Excelente" | "Bom" | "Potencial" | "Frio" | "Fora";

export interface IcpBreakdownItem {
  criterion: string;   // rótulo humano ("CNAE", "Cidade", ...)
  weight: number;      // peso configurado
  result: "match" | "miss" | "disqualifying" | "bonus" | "penalty" | "unknown";
  points: number;      // pontos aplicados (pode ser negativo)
  /** Estado normalizado 4-way — fonte única de verdade para a UI. */
  state?: CriterionState;
  /** true quando o dado ainda não foi enriquecido; não penaliza o denominador. */
  pending_enrichment?: boolean;
}

/**
 * 4-way classification (Release 1.3.9):
 *  - matched:      dado encontrado e atende ao critério positivo.
 *  - not_matched:  dado encontrado e não atende (mas não é proibido).
 *  - unknown:      dado ausente/ainda não enriquecido → NUNCA é desqualificador.
 *  - disqualified: dado presente E bate regra proibida/negativa comprovada.
 */
export type CriterionState = "matched" | "not_matched" | "unknown" | "disqualified";

export interface CriterionEvaluation {
  criterion: string;
  field_key: string;
  state: CriterionState;
  weight: number;
  points: number;
  pending_enrichment: boolean;
  message: string;
}

export interface UniversalIcpScore {
  id: string;
  score: number;              // 0..100
  rating: IcpRating;
  reasons: string[];          // ex.: "+ CNAE compatível (+20)", "- Sem Website (-3)"
  breakdown: IcpBreakdownItem[];
  matched: string[];
  missing: string[];
  disqualifying: string[];
  qualified_for_import: boolean;
  /** Avaliação normalizada 4-way. Frontend deve consumir daqui via display-mapper. */
  evaluations: CriterionEvaluation[];
  /** true quando há critérios pending_enrichment em modo preliminary. */
  has_pending_enrichment: boolean;
  /** true quando dados insuficientes impedem score final confiável. */
  insufficient_data: boolean;
}

export interface ClassificationSummary {
  total: number;
  excelente: number;
  bom: number;
  potencial: number;
  frio: number;
  fora: number;
  avg: number;
  max: number;
  min: number;
  duration_ms: number;
}

// ---------------------------------------------------------------------------
// Rating helper (única fonte de verdade)
// ---------------------------------------------------------------------------
export function ratingFromScore(score: number): IcpRating {
  if (score >= 95) return "Excelente";
  if (score >= 80) return "Bom";
  if (score >= 60) return "Potencial";
  if (score >= 40) return "Frio";
  return "Fora";
}

// ---------------------------------------------------------------------------
// Regras dinâmicas (icp_rules)
// ---------------------------------------------------------------------------
export interface IcpRule {
  id?: string;
  category: string;
  field_key: string;    // ex.: "cnae", "city", "estimated_employees"
  field_label: string;  // rótulo humano
  field_type: string;   // "text" | "number" | "boolean" | "list" | "range"
  operator: string;     // "equals" | "in" | "not_in" | "gte" | "lte" | "between" | "contains" | "exists" | "not_exists"
  value: any;
  weight: number;
  required: boolean;
  disqualifying: boolean;
  positive_or_negative: string; // "positive" | "negative"
  order?: number;
  requires_enrichment?: boolean; // Fase Pré-Score: se true, é ignorado no modo "preliminary"
}

function normStr(v: any): string {
  return (v ?? "").toString().trim().toLowerCase();
}
function toArr(v: any): any[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
function readField(p: ProspectSourceResult, key: string): any {
  if (p == null) return undefined;
  if (key in p) return (p as any)[key];
  if (p.raw && key in p.raw) return p.raw[key];
  return undefined;
}

/**
 * Campos considerados "básicos" (disponíveis antes do enriquecimento pago).
 * Regras cujo field_key esteja fora desta lista OU cujo dado esteja ausente
 * no modo "preliminary" são marcadas como pending_enrichment e NÃO penalizam.
 */
export const BASIC_ICP_FIELDS = new Set<string>([
  "cnpj",
  "cnae",
  "cnaes_secundarios",
  "segment",
  "category",
  "city",
  "state",
  "porte",
  "capital_social",
  "estimated_employees",
  "situacao_cadastral",
  "data_abertura",
  "company_name",
  "website",
  "phone",
  "email",
  "razao_social",
  "nome_fantasia",
]);

function isFieldPresent(v: any): boolean {
  if (v == null) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/** Avalia um único rule contra a empresa. Retorna se "bate" ou não. */
function evaluateRule(p: ProspectSourceResult, rule: IcpRule): boolean {
  const raw = readField(p, rule.field_key);
  const val = rule.value;
  switch (rule.operator) {
    case "exists":
      return raw != null && raw !== "" && !(Array.isArray(raw) && raw.length === 0);
    case "not_exists":
      return raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0);
    case "equals":
      return normStr(raw) === normStr(val);
    case "in":
      return toArr(val).some((v) => normStr(raw) === normStr(v) || normStr(raw).includes(normStr(v)));
    case "not_in":
      return !toArr(val).some((v) => normStr(raw).includes(normStr(v)));
    case "contains":
      return normStr(raw).includes(normStr(val));
    case "gte":
      return Number(raw ?? 0) >= Number(val ?? 0);
    case "lte":
      return Number(raw ?? 0) <= Number(val ?? 0);
    case "between": {
      const [min, max] = toArr(val).map(Number);
      const n = Number(raw ?? 0);
      return n >= min && n <= max;
    }
    default:
      return false;
  }
}

/** Executa a classificação por regras dinâmicas. */
function classifyByRules(
  p: ProspectSourceResult,
  rules: IcpRule[],
  minimumScore: number,
  mode: EngineMode = "final",
): UniversalIcpScore {
  // Release 1.4.0 — Modelo de score comercial:
  //   score = soma dos pesos de regras positivas MATCHED (cap 100)
  //         − soma dos pesos de regras negativas comprovadas (disqualified).
  //   Campos UNKNOWN não afetam o score (nem numerador nem denominador).
  //   Somente disqualificadores reais rebaixam ao bucket "Fora do Perfil".
  let earned = 0;
  let penalties = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  const disqualifying: string[] = [];
  const reasons: string[] = [];
  const breakdown: IcpBreakdownItem[] = [];
  const pending: string[] = [];
  const evaluations: CriterionEvaluation[] = [];

  for (const rule of rules) {
    const w = Math.max(0, Number(rule.weight ?? 0));
    const isPositive = rule.positive_or_negative !== "negative";
    const raw = readField(p, rule.field_key);
    const hasData = isFieldPresent(raw);

    // Modo preliminary: pula qualquer regra que depende de dado enriquecido
    // (marcador explícito OU field_key fora da lista de básicos OU dado
    // ausente para um campo básico ainda não coletado).
    if (mode === "preliminary") {
      const isBasic = BASIC_ICP_FIELDS.has(rule.field_key);
      const skip =
        rule.requires_enrichment === true ||
        !isBasic ||
        !hasData;
      if (skip) {
        pending.push(rule.field_label);
        reasons.push(`… ${rule.field_label} (pendente de enriquecimento)`);
        breakdown.push({
          criterion: rule.field_label,
          weight: w,
          result: "unknown",
          points: 0,
          state: "unknown",
          pending_enrichment: true,
        });
        evaluations.push({
          criterion: rule.field_label,
          field_key: rule.field_key,
          state: "unknown",
          weight: w,
          points: 0,
          pending_enrichment: true,
          message: `${rule.field_label} pendente de enriquecimento`,
        });
        continue;
      }
    }

    // Modo final: dado ausente vira "unknown" (nunca desqualificador).
    // Só entra em disqualified quando existe dado e bate regra proibida/negativa.
    if (!hasData) {
      // Release 1.4.0: dado ausente é sempre UNKNOWN e NUNCA penaliza o score.
      const treatAsPending =
        rule.requires_enrichment === true || !BASIC_ICP_FIELDS.has(rule.field_key);
      if (treatAsPending) {
        pending.push(rule.field_label);
        reasons.push(`… ${rule.field_label} (pendente de enriquecimento)`);
        breakdown.push({
          criterion: rule.field_label,
          weight: w,
          result: "unknown",
          points: 0,
          state: "unknown",
          pending_enrichment: true,
        });
        evaluations.push({
          criterion: rule.field_label,
          field_key: rule.field_key,
          state: "unknown",
          weight: w,
          points: 0,
          pending_enrichment: true,
          message: `${rule.field_label} pendente de enriquecimento`,
        });
        continue;
      }
      // Campo básico ausente em modo final: unknown (não desqualifica, não penaliza).
      if (isPositive) missing.push(rule.field_label);
      reasons.push(`… ${rule.field_label} desconhecido`);
      breakdown.push({
        criterion: rule.field_label,
        weight: w,
        result: "unknown",
        points: 0,
        state: "unknown",
        pending_enrichment: false,
      });
      evaluations.push({
        criterion: rule.field_label,
        field_key: rule.field_key,
        state: "unknown",
        weight: w,
        points: 0,
        pending_enrichment: false,
        message: `${rule.field_label} desconhecido`,
      });
      continue;
    }

    const hit = evaluateRule(p, rule);

    if (hit) {
      if (isPositive) {
        earned += w;
        matched.push(rule.field_label);
        reasons.push(`+ ${rule.field_label} (+${w})`);
        breakdown.push({
          criterion: rule.field_label,
          weight: w,
          result: "match",
          points: w,
          state: "matched",
          pending_enrichment: false,
        });
        evaluations.push({
          criterion: rule.field_label,
          field_key: rule.field_key,
          state: "matched",
          weight: w,
          points: w,
          pending_enrichment: false,
          message: `${rule.field_label} atende ao ICP`,
        });
      } else {
        // regra negativa/proibida COMPROVADA (dado presente + regra bate) → disqualified real
        penalties += w;
        disqualifying.push(rule.field_label);
        reasons.push(`- ${rule.field_label} (-${w})`);
        breakdown.push({
          criterion: rule.field_label,
          weight: w,
          result: "penalty",
          points: -w,
          state: "disqualified",
          pending_enrichment: false,
        });
        evaluations.push({
          criterion: rule.field_label,
          field_key: rule.field_key,
          state: "disqualified",
          weight: w,
          points: -w,
          pending_enrichment: false,
          message: `${rule.field_label} aciona regra proibida`,
        });
      }
    } else {
      if (isPositive) {
        // Dado existe e NÃO atende ao critério positivo → not_matched.
        // Release 1.4.0: NÃO subtrai pontos, apenas deixa de somar.
        missing.push(rule.field_label);
        if (rule.disqualifying) {
          disqualifying.push(rule.field_label);
          reasons.push(`✗ ${rule.field_label} não atende (desqualificador)`);
          breakdown.push({
            criterion: rule.field_label,
            weight: w,
            result: "disqualifying",
            points: 0,
            state: "disqualified",
            pending_enrichment: false,
          });
          evaluations.push({
            criterion: rule.field_label,
            field_key: rule.field_key,
            state: "disqualified",
            weight: w,
            points: 0,
            pending_enrichment: false,
            message: `${rule.field_label} não atende — desqualificador`,
          });
        } else {
          reasons.push(`- ${rule.field_label} não atende`);
          breakdown.push({
            criterion: rule.field_label,
            weight: w,
            result: "miss",
            points: 0,
            state: "not_matched",
            pending_enrichment: false,
          });
          evaluations.push({
            criterion: rule.field_label,
            field_key: rule.field_key,
            state: "not_matched",
            weight: w,
            points: 0,
            pending_enrichment: false,
            message: `${rule.field_label} não atende ao ICP`,
          });
        }
      } else {
        // Regra negativa que NÃO bateu → sem impacto (dado presente, mas fora da lista proibida).
        evaluations.push({
          criterion: rule.field_label,
          field_key: rule.field_key,
          state: "matched",
          weight: w,
          points: 0,
          pending_enrichment: false,
          message: `${rule.field_label} fora da lista proibida`,
        });
      }
    }
  }

  // Score comercial absoluto (cap 100). Sem denominador variável.
  let score = Math.max(0, Math.min(100, earned - penalties));
  // Desqualificador real → rebaixa para bucket "Fora do Perfil" (0..39).
  if (disqualifying.length > 0) score = Math.min(score, 39);
  const rating = ratingFromScore(score);
  const qualified_for_import = score >= minimumScore && disqualifying.length === 0;
  const has_pending_enrichment = evaluations.some((e) => e.pending_enrichment);
  // "Dados insuficientes" quando nenhum critério positivo foi matched E
  // nenhum desqualificador acionou — informativo, não altera classificação.
  const unknownCount = evaluations.filter((e) => e.state === "unknown").length;
  const insufficient_data =
    rules.length > 0 &&
    matched.length === 0 &&
    disqualifying.length === 0 &&
    unknownCount > 0;

  return {
    id: p.id,
    score,
    rating,
    reasons,
    breakdown,
    matched,
    missing,
    disqualifying,
    qualified_for_import,
    evaluations,
    has_pending_enrichment,
    insufficient_data,
  };
}

/** Fallback para ICPs antigos (criteria_json + weights_json). */
function classifyByLegacy(
  p: ProspectSourceResult,
  criteria: IcpCriteria,
  weights: IcpWeights,
  minimumScore: number,
): UniversalIcpScore {
  const out = calculateIcpScore(p as any, criteria, weights);
  const reasons: string[] = [];
  const breakdown: IcpBreakdownItem[] = [];
  const evaluations: CriterionEvaluation[] = [];
  for (const m of out.matched) {
    reasons.push(`+ ${m}`);
    breakdown.push({ criterion: m, weight: 0, result: "match", points: 0, state: "matched", pending_enrichment: false });
    evaluations.push({ criterion: m, field_key: m, state: "matched", weight: 0, points: 0, pending_enrichment: false, message: m });
  }
  for (const m of out.missing) {
    reasons.push(`- ${m} ausente`);
    breakdown.push({ criterion: m, weight: 0, result: "miss", points: 0, state: "unknown", pending_enrichment: false });
    evaluations.push({ criterion: m, field_key: m, state: "unknown", weight: 0, points: 0, pending_enrichment: false, message: `${m} desconhecido` });
  }
  for (const d of out.disqualifying) {
    reasons.push(`✗ ${d} (desqualificador)`);
    breakdown.push({ criterion: d, weight: 0, result: "disqualifying", points: 0, state: "disqualified", pending_enrichment: false });
    evaluations.push({ criterion: d, field_key: d, state: "disqualified", weight: 0, points: 0, pending_enrichment: false, message: `${d} desqualificador` });
  }
  const rating = ratingFromScore(out.score);
  return {
    id: p.id,
    score: out.score,
    rating,
    reasons,
    breakdown,
    matched: out.matched,
    missing: out.missing,
    disqualifying: out.disqualifying,
    qualified_for_import: out.score >= minimumScore && out.disqualifying.length === 0,
    evaluations,
    has_pending_enrichment: false,
    insufficient_data: out.matched.length === 0 && out.missing.length > 0,
  };
}

// ---------------------------------------------------------------------------
// API principal do motor
// ---------------------------------------------------------------------------
export interface EngineInput {
  icp: {
    id: string;
    minimum_score?: number | null;
    preliminary_minimum_score?: number | null;
    criteria_json?: any;
    weights_json?: any;
  };
  rules?: IcpRule[]; // se vier vazio/undefined, cai no legado
  companies: ProspectSourceResult[];
  mode?: EngineMode;
}

export type EngineMode = "preliminary" | "final";

export interface EngineOutput {
  icpId: string;
  scores: UniversalIcpScore[];
  summary: ClassificationSummary;
}

/**
 * Classifica em lote (nunca por empresa). Uma única passada em memória.
 * Não faz IO — puro. Persistência é responsabilidade do server function.
 */
export function runUniversalIcpEngine(input: EngineInput): EngineOutput {
  const start = Date.now();
  const mode: EngineMode = input.mode ?? "final";
  const minScore =
    mode === "preliminary"
      ? input.icp.preliminary_minimum_score ?? 70
      : input.icp.minimum_score ?? 80;
  const useRules = Array.isArray(input.rules) && input.rules.length > 0;
  const criteria = (input.icp.criteria_json ?? {}) as IcpCriteria;
  const weights = (input.icp.weights_json ?? {}) as IcpWeights;

  const scores = input.companies.map((c) =>
    useRules
      ? classifyByRules(c, input.rules as IcpRule[], minScore, mode)
      : classifyByLegacy(c, criteria, weights, minScore),
  );

  let sum = 0, max = 0, min = scores.length > 0 ? 100 : 0;
  let excelente = 0, bom = 0, potencial = 0, frio = 0, fora = 0;
  for (const s of scores) {
    sum += s.score;
    if (s.score > max) max = s.score;
    if (s.score < min) min = s.score;
    if (s.rating === "Excelente") excelente++;
    else if (s.rating === "Bom") bom++;
    else if (s.rating === "Potencial") potencial++;
    else if (s.rating === "Frio") frio++;
    else fora++;
  }

  const summary: ClassificationSummary = {
    total: scores.length,
    excelente, bom, potencial, frio, fora,
    avg: scores.length > 0 ? Math.round(sum / scores.length) : 0,
    max, min,
    duration_ms: Date.now() - start,
  };
  return { icpId: input.icp.id, scores, summary };
}

/**
 * Mapeia uma linha de `prospecting_results` para o shape universal.
 * Outras fontes futuras devem prover mappers análogos.
 */
export function mapProspectingResultToUniversal(r: any): ProspectSourceResult {
  return {
    id: r.id,
    company_name: r.company_name,
    cnpj: r.cnpj,
    city: r.city,
    state: r.state,
    porte: r.porte,
    estimated_employees: r.estimated_employees,
    capital_social: r.capital_social,
    phone: r.phone,
    whatsapp: r.whatsapp,
    email: r.email,
    website: r.website,
    linkedin_url: r.linkedin_url,
    instagram_url: r.instagram_url,
    cnae: r.cnae,
    cnaes_secundarios: r.cnaes_secundarios,
    segment: r.segment,
    category: r.category,
    situacao_cadastral: r.situacao_cadastral,
    data_abertura: r.data_abertura,
    technologies: r.technologies,
    source: "prospecting",
    raw: r,
  };
}

/** Cor associada a cada rating (para UI). */
export const RATING_COLOR: Record<IcpRating, string> = {
  Excelente: "bg-emerald-600",
  Bom: "bg-green-500",
  Potencial: "bg-amber-500",
  Frio: "bg-slate-400",
  Fora: "bg-red-500",
};