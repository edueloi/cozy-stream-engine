/**
 * Smart Prospect Flow — validação Produto/ICP × filtros da busca.
 *
 * Módulo PURO (sem I/O, sem Supabase). Compara os filtros que o usuário
 * escolheu na Prospecção Inteligente com as regras do ICP resolvido.
 *
 * Regras principais:
 *  - Se o filtro escolhido casa com uma regra "disqualifying" ou aciona uma
 *    "not_in" de campo desqualificador, o bloqueio é OBJETIVO: bloqueia.
 *  - Se o filtro obrigatório da ICP (required + operator "in") tem valor
 *    conhecido e o filtro da busca não pertence à lista, bloqueia.
 *  - Se não conseguimos comparar (filtro ausente ou campo desconhecido),
 *    vira warning — nunca bloqueia.
 *
 * Toda a validação é reversível pelo usuário: revisar filtros, escolher
 * outro ICP ou outro Produto. Não existe "continuar mesmo assim" para
 * incompatibilidades objetivas.
 */

export interface IcpRuleLite {
  field_key: string;
  operator: string;
  value: unknown;
  required?: boolean | null;
  disqualifying?: boolean | null;
  positive_or_negative?: string | null;
  weight?: number | null;
  requires_enrichment?: boolean | null;
}

export interface SearchFilters {
  // aceita chaves comuns; qualquer coisa desconhecida vira `unknown_filters`
  uf?: string | string[] | null;
  estado?: string | string[] | null;
  cidade?: string | string[] | null;
  city?: string | string[] | null;
  cnae?: string | string[] | null;
  cnaes?: string[] | null;
  cnae_principal?: string | null;
  porte?: string | string[] | null;
  situacao_cadastral?: string | string[] | null;
  segmento?: string | string[] | null;
  segment?: string | string[] | null;
  [key: string]: unknown;
}

export interface ValidateInput {
  filters: SearchFilters | null | undefined;
  rules: IcpRuleLite[] | null | undefined;
}

export type BlockerReason =
  | { field: string; kind: "forbidden"; message: string; expected?: string[]; got?: string | string[] }
  | { field: string; kind: "disqualifying"; message: string; expected?: string[]; got?: string | string[] }
  | { field: string; kind: "required_mismatch"; message: string; expected?: string[]; got?: string | string[] };

export type Warning =
  | { field: string; kind: "missing_filter"; message: string }
  | { field: string; kind: "broad_filter"; message: string }
  | { field: string; kind: "unknown_field"; message: string };

export interface ValidateOutput {
  compatible: boolean;
  blockers: BlockerReason[];
  warnings: Warning[];
  matched_filters: string[];
  unknown_filters: string[];
  /** Estimativa grosseira de aderência (0..100), útil para UI. */
  estimated_preliminary_fit: number;
}

const CANONICAL_ALIASES: Record<string, string> = {
  estado: "uf",
  uf: "uf",
  city: "cidade",
  cidade: "cidade",
  cnae: "cnae",
  cnaes: "cnae",
  cnae_principal: "cnae",
  porte: "porte",
  situacao_cadastral: "situacao_cadastral",
  segment: "segmento",
  segmento: "segmento",
};

const KNOWN_FIELDS = new Set([
  "uf",
  "cidade",
  "cnae",
  "porte",
  "situacao_cadastral",
  "segmento",
]);

function toArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  return String(v).split(",").map((s) => s.trim()).filter(Boolean);
}

function normalizeFilters(filters: SearchFilters | null | undefined): {
  values: Record<string, string[]>;
  unknown: string[];
} {
  const values: Record<string, string[]> = {};
  const unknown: string[] = [];
  const raw = (filters ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const canon = CANONICAL_ALIASES[k];
    if (!canon) {
      // parâmetros de fonte (limit, page, etc.) não são comparáveis
      if (["limit", "page", "offset", "source", "termo"].includes(k)) continue;
      unknown.push(k);
      continue;
    }
    const arr = toArray(v);
    if (arr.length === 0) continue;
    values[canon] = (values[canon] ?? []).concat(arr);
  }
  return { values, unknown };
}

function ruleList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (v == null) return [];
  return [String(v)];
}

/** Núcleo puro — testável isoladamente. */
export function validateSearchAgainstIcp(input: ValidateInput): ValidateOutput {
  const rules = (input.rules ?? []).filter((r) => KNOWN_FIELDS.has(r.field_key));
  const { values, unknown } = normalizeFilters(input.filters ?? {});
  const blockers: BlockerReason[] = [];
  const warnings: Warning[] = [];
  const matched: string[] = [];

  // Pré-cálculo: o CNAE informado é objetivamente compatível com o ICP?
  // Usado para rebaixar divergências de Segmento a warning quando o CNAE
  // — que é a classificação técnica mais precisa — já valida a empresa.
  const cnaeFilterVals = values["cnae"] ?? [];
  const cnaeRules = rules.filter((r) => r.field_key === "cnae");
  let cnaeBlocked = false;
  let cnaeAllowedByRequired = false;
  let cnaeHasRequiredRule = false;
  for (const r of cnaeRules) {
    const vals = new Set(ruleList(r.value).map((x) => x.toLowerCase()));
    if (r.disqualifying && (r.operator === "not_in" || r.operator === "in")) {
      if (cnaeFilterVals.some((fv) => vals.has(fv.toLowerCase()))) cnaeBlocked = true;
    }
    if (r.required && r.operator === "in") {
      cnaeHasRequiredRule = true;
      if (cnaeFilterVals.length > 0 && cnaeFilterVals.every((fv) => vals.has(fv.toLowerCase()))) {
        cnaeAllowedByRequired = true;
      }
    }
  }
  // CNAE é considerado "compatível" quando informado e não bloqueado, e
  // (sem regra obrigatória de CNAE) ou (regra obrigatória satisfeita).
  const cnaeCompatible =
    cnaeFilterVals.length > 0 && !cnaeBlocked && (!cnaeHasRequiredRule || cnaeAllowedByRequired);

  for (const rule of rules) {
    const field = rule.field_key;
    const filterVals = values[field] ?? [];
    const ruleVals = ruleList(rule.value);
    const isDisq = Boolean(rule.disqualifying);
    const isRequired = Boolean(rule.required);

    // 1) Desqualificadores objetivos: se o filtro escolhido intersecta a lista proibida, bloqueia.
    if (isDisq && (rule.operator === "not_in" || rule.operator === "in")) {
      // "not_in" com disqualifying=true significa: valores listados são PROIBIDOS.
      // "in" com disqualifying=true significa: se cair aqui, é motivo de descarte.
      const forbidden = new Set(ruleVals.map((x) => x.toLowerCase()));
      for (const fv of filterVals) {
        if (forbidden.has(fv.toLowerCase())) {
          blockers.push({
            field,
            kind: rule.operator === "not_in" ? "forbidden" : "disqualifying",
            message:
              rule.operator === "not_in"
                ? `${field.toUpperCase()} "${fv}" é proibido pelo ICP.`
                : `${field.toUpperCase()} "${fv}" é desqualificador no ICP.`,
            expected: ruleVals,
            got: fv,
          });
        }
      }
      continue;
    }

    // 2) Obrigatórios "in" — se o filtro tem valor, precisa pertencer à lista.
    if (isRequired && rule.operator === "in") {
      if (filterVals.length === 0) {
        warnings.push({
          field,
          kind: "missing_filter",
          message: `Filtro "${field}" não informado — o ICP exige este critério.`,
        });
        continue;
      }
      const allowed = new Set(ruleVals.map((x) => x.toLowerCase()));
      const bad = filterVals.filter((fv) => !allowed.has(fv.toLowerCase()));
      if (bad.length > 0) {
        // Segmento é uma classificação comercial ampla. Quando o CNAE informado
        // já é objetivamente compatível com o ICP, uma divergência textual de
        // Segmento vira aviso, não bloqueio. CNAE tem prioridade técnica.
        if (field === "segmento" && cnaeCompatible) {
          warnings.push({
            field,
            kind: "broad_filter",
            message: `Segmento "${bad.join(", ")}" não corresponde exatamente ao ICP, mas o CNAE informado é compatível — o CNAE será usado como critério principal.`,
          });
        } else {
          blockers.push({
            field,
            kind: "required_mismatch",
            message: `${field.toUpperCase()} informado (${bad.join(", ")}) fora do critério obrigatório do ICP.`,
            expected: ruleVals,
            got: bad,
          });
        }
      } else {
        matched.push(field);
      }
      continue;
    }

    // 3) Não obrigatório e não desqualificador: se casa, marca matched; se ausente, warning leve.
    if (rule.operator === "in" && filterVals.length > 0) {
      const allowed = new Set(ruleVals.map((x) => x.toLowerCase()));
      if (filterVals.some((fv) => allowed.has(fv.toLowerCase()))) matched.push(field);
    } else if (filterVals.length === 0 && (rule.weight ?? 0) >= 8) {
      warnings.push({
        field,
        kind: "broad_filter",
        message: `Filtro "${field}" não informado — reduz aderência ao ICP.`,
      });
    }
  }

  for (const f of unknown) {
    warnings.push({
      field: f,
      kind: "unknown_field",
      message: `Filtro "${f}" não é comparável ao ICP e será ignorado na validação.`,
    });
  }

  const compatible = blockers.length === 0;
  const rulesCount = rules.filter((r) => KNOWN_FIELDS.has(r.field_key)).length || 1;
  const estimated_preliminary_fit = Math.max(
    0,
    Math.min(100, Math.round((matched.length / rulesCount) * 100)),
  );

  return {
    compatible,
    blockers,
    warnings,
    matched_filters: matched,
    unknown_filters: unknown,
    estimated_preliminary_fit,
  };
}