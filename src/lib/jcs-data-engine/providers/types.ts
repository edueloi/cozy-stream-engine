import type { NormalizedCompany, NormalizedDecisionMaker } from "../normalizer";

export interface HealthReport {
  provider: string;
  online: boolean;
  api_ok: boolean;
  latency_ms: number | null;
  last_error?: string | null;
  checked_at: string;
}

export interface CompanySearchInput {
  cnpj?: string;
  name?: string;
  city?: string;
  state?: string;
  limit?: number;
}

export interface ProviderAdapter {
  readonly name: string;
  readonly capabilities: string[];
  health(): Promise<HealthReport>;
  companySearch?(input: CompanySearchInput): Promise<NormalizedCompany[]>;
  companyEnrichment?(input: { cnpj: string }): Promise<NormalizedCompany | null>;
  findDecisionMakers?(input: { cnpj: string; limit?: number }): Promise<NormalizedDecisionMaker[]>;
  professionalProfile?(input: { linkedin?: string; name?: string; company?: string }): Promise<NormalizedDecisionMaker | null>;
  contactEnrichment?(input: { cnpj?: string; email?: string; phone?: string }): Promise<Partial<NormalizedCompany> | null>;
}