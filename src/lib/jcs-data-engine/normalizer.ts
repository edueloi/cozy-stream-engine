// JCS Data Engine — Normalizer
// Todos os Providers do Data Engine devem devolver dados neste formato canônico.
// Não é usado por Casa dos Dados/Apify diretos da tela de Prospecção (que mantêm
// seus próprios shapes) — somente pelo motor JCS quando a flag jcs_data_engine_enabled
// estiver ligada.

export interface NormalizedDecisionMaker {
  name: string;
  role?: string | null;
  department?: string | null;
  seniority?: string | null;
  linkedin?: string | null;
  email?: string | null;
  phone?: string | null;
  confidence?: number | null; // 0..100
  source: string;
}

export interface NormalizedCompany {
  company_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  segment: string | null;
  employees: number | null;
  capital: number | null;
  decision_makers: NormalizedDecisionMaker[];
  contacts: Array<{ kind: "email" | "phone" | "whatsapp"; value: string; source?: string }>;
  source: string;
  raw: unknown;
}

export function emptyCompany(source: string): NormalizedCompany {
  return {
    company_name: null,
    legal_name: null,
    cnpj: null,
    website: null,
    linkedin: null,
    instagram: null,
    phone: null,
    email: null,
    address: null,
    city: null,
    state: null,
    segment: null,
    employees: null,
    capital: null,
    decision_makers: [],
    contacts: [],
    source,
    raw: null,
  };
}

// Data-quality score: 0..100 baseado em completude dos campos-chave.
export function computeDataQualityScore(c: NormalizedCompany): number {
  const weights: Array<[keyof NormalizedCompany, number]> = [
    ["company_name", 10],
    ["cnpj", 10],
    ["website", 10],
    ["phone", 15],
    ["email", 15],
    ["linkedin", 10],
    ["city", 5],
    ["state", 5],
    ["segment", 10],
    ["employees", 5],
    ["capital", 5],
  ];
  let s = 0;
  for (const [k, w] of weights) if (c[k] != null && String(c[k]).length > 0) s += w;
  return Math.min(100, s);
}