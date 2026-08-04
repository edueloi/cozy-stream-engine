// Deterministic ICP scoring — no AI. Weights are configurable per criterion.

export interface IcpCriteria {
  desired_cnaes?: string[];
  forbidden_cnaes?: string[];
  segments?: string[];
  states?: string[];
  cities?: string[];
  portes?: string[];
  min_capital_social?: number | null;
  min_faturamento?: number | null;
  min_employees?: number | null;
  max_employees?: number | null;
  situacao_cadastral?: string[];
  min_company_age_years?: number | null;
  desired_roles?: string[];
  forbidden_roles?: string[];
  required_criteria?: string[];
}

export type IcpWeights = Record<string, number>;

export const DEFAULT_WEIGHTS: IcpWeights = {
  desired_cnaes: 20,
  segments: 10,
  states: 5,
  cities: 5,
  portes: 10,
  min_capital_social: 8,
  min_faturamento: 8,
  employees: 12,
  situacao_cadastral: 8,
  min_company_age_years: 6,
  desired_roles: 8,
};

export interface IcpScoreResult {
  score: number;
  matched: string[];
  missing: string[];
  disqualifying: string[];
}

interface Prospect {
  cnae?: string | null;
  cnaes_secundarios?: string[] | null;
  segment?: string | null;
  category?: string | null;
  state?: string | null;
  city?: string | null;
  porte?: string | null;
  capital_social?: number | null;
  estimated_employees?: number | null;
  situacao_cadastral?: string | null;
  data_abertura?: string | null;
  raw?: any;
}

function norm(v: string | null | undefined) {
  return (v ?? "").toString().trim().toLowerCase();
}

function anyMatch(list: string[] | undefined, val: string | null | undefined) {
  if (!list || list.length === 0) return null;
  const v = norm(val);
  if (!v) return false;
  return list.some((x) => v.includes(norm(x)));
}

export function calculateIcpScore(
  p: Prospect,
  criteria: IcpCriteria,
  weights: IcpWeights,
): IcpScoreResult {
  const w = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) };
  const required = new Set(criteria.required_criteria ?? []);

  let earned = 0;
  let possible = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  const disqualifying: string[] = [];

  const consider = (key: string, weight: number, hit: boolean | null, label: string) => {
    if (hit === null) return; // criterion not configured
    possible += weight;
    if (hit) {
      earned += weight;
      matched.push(label);
    } else {
      missing.push(label);
      if (required.has(key)) disqualifying.push(label);
    }
  };

  // Forbidden CNAEs — hard block
  if (criteria.forbidden_cnaes?.length) {
    const allCnaes = [p.cnae, ...(p.cnaes_secundarios ?? [])].filter(Boolean) as string[];
    const hit = allCnaes.some((c) => criteria.forbidden_cnaes!.some((f) => norm(c).includes(norm(f))));
    if (hit) disqualifying.push("CNAE proibido");
  }

  // Desired CNAEs
  if (criteria.desired_cnaes?.length) {
    const allCnaes = [p.cnae, ...(p.cnaes_secundarios ?? [])].filter(Boolean) as string[];
    const hit = allCnaes.some((c) => criteria.desired_cnaes!.some((d) => norm(c).includes(norm(d))));
    consider("desired_cnaes", w.desired_cnaes ?? 0, hit, "CNAE desejado");
  }

  consider("segments", w.segments ?? 0, anyMatch(criteria.segments, p.segment ?? p.category), "Segmento");
  consider("states", w.states ?? 0, anyMatch(criteria.states, p.state), "UF");
  consider("cities", w.cities ?? 0, anyMatch(criteria.cities, p.city), "Cidade");
  consider("portes", w.portes ?? 0, anyMatch(criteria.portes, p.porte), "Porte");

  if (criteria.min_capital_social != null) {
    const hit = (p.capital_social ?? 0) >= criteria.min_capital_social;
    consider("min_capital_social", w.min_capital_social ?? 0, hit, "Capital social mínimo");
  }
  if (criteria.min_faturamento != null) {
    const fat = Number(p.raw?.faturamento_estimado ?? p.raw?.faturamento ?? 0);
    const hit = fat >= criteria.min_faturamento;
    consider("min_faturamento", w.min_faturamento ?? 0, hit, "Faturamento estimado mínimo");
  }

  if (criteria.min_employees != null || criteria.max_employees != null) {
    const emp = p.estimated_employees ?? 0;
    let hit = true;
    if (criteria.min_employees != null && emp < criteria.min_employees) hit = false;
    if (criteria.max_employees != null && emp > criteria.max_employees) hit = false;
    consider("employees", w.employees ?? 0, hit, "Funcionários estimados");
  }

  if (criteria.situacao_cadastral?.length) {
    const hit = anyMatch(criteria.situacao_cadastral, p.situacao_cadastral);
    consider("situacao_cadastral", w.situacao_cadastral ?? 0, hit, "Situação cadastral");
  }

  if (criteria.min_company_age_years != null && p.data_abertura) {
    const opened = new Date(p.data_abertura).getTime();
    if (!isNaN(opened)) {
      const years = (Date.now() - opened) / (365.25 * 86400_000);
      const hit = years >= criteria.min_company_age_years;
      consider("min_company_age_years", w.min_company_age_years ?? 0, hit, "Idade mínima da empresa");
    }
  }

  if (criteria.desired_roles?.length) {
    // No decision-maker data on result row yet; mark as missing (not disqualifying unless required)
    consider("desired_roles", w.desired_roles ?? 0, false, "Cargos desejados");
  }

  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  return {
    score: disqualifying.length > 0 ? Math.min(score, 59) : score,
    matched,
    missing,
    disqualifying,
  };
}