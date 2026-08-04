// Registry de seleção automática de providers.
// Filtra e ordena candidatos para uma capability antes de qualquer HTTP.

import { getProviderRuntimeConfig, type RuntimeConfig } from "./runtime-config.server";
import { checkBudget } from "@/lib/jcs-data-engine/cache.server";
import { computeHealth } from "./health-score.server";

export type Capability =
  | "company_search"
  | "company_enrichment"
  | "decision_maker"
  | "linkedin_company"
  | "linkedin_people"
  | "email_lookup"
  | "phone_lookup"
  | "website_lookup"
  | "instagram_lookup"
  | "google_maps";

// Ordem padrão por capability — nunca hardcoded no fluxo.
// Pode ser sobrescrita por provider_credentials.priority.
export const DEFAULT_CAPABILITY_ORDER: Record<Capability, string[]> = {
  company_search: ["kipflow", "casa_dos_dados", "apify", "custom_api", "webhook"],
  company_enrichment: ["kipflow", "casa_dos_dados", "apify"],
  decision_maker: ["kipflow", "apify"],
  linkedin_company: ["apify"],
  linkedin_people: ["apify"],
  email_lookup: ["kipflow", "apify"],
  phone_lookup: ["kipflow", "apify"],
  website_lookup: ["kipflow", "apify"],
  instagram_lookup: ["apify"],
  google_maps: ["apify"],
};

// Capabilities suportadas por cada adapter — nunca tentar capability inexistente.
export const PROVIDER_CAPABILITIES: Record<string, Capability[]> = {
  kipflow: [
    "company_enrichment",
    "decision_maker",
    "email_lookup",
    "phone_lookup",
    "website_lookup",
    "company_search",
  ],
  casa_dos_dados: ["company_search", "company_enrichment"],
  apify: [
    "google_maps",
    "linkedin_company",
    "linkedin_people",
    "instagram_lookup",
    "company_search",
  ],
  custom_api: ["company_search"],
  webhook: ["company_search"],
};

export interface CandidateProvider {
  provider: string;
  config: RuntimeConfig;
  priority: number;
  health: number;
  avgLatencyMs: number;
  skipReason?: string;
  eligible: boolean;
}

export interface SelectOptions {
  organizationId: string;
  capability: Capability;
  mode?: "auto" | "manual";
  pinned?: string | null;
  budgetCheck?: boolean;
}

export async function selectProviders(opts: SelectOptions): Promise<CandidateProvider[]> {
  const { organizationId, capability, mode = "auto", pinned = null, budgetCheck = true } = opts;

  if (mode === "manual" && pinned) {
    const c = await evaluate(organizationId, pinned, capability, budgetCheck);
    return c.eligible ? [c] : [];
  }

  const defaults = DEFAULT_CAPABILITY_ORDER[capability] ?? [];
  const evaluated = await Promise.all(
    defaults.map((p) => evaluate(organizationId, p, capability, budgetCheck)),
  );

  const eligible = evaluated.filter((c) => c.eligible);
  eligible.sort(
    (a, b) =>
      a.priority - b.priority ||
      b.health - a.health ||
      a.avgLatencyMs - b.avgLatencyMs,
  );
  return eligible;
}

async function evaluate(
  organizationId: string,
  provider: string,
  capability: Capability,
  budgetCheck: boolean,
): Promise<CandidateProvider> {
  const caps = PROVIDER_CAPABILITIES[provider];
  if (!caps || !caps.includes(capability)) {
    return skeleton(provider, "unsupported_capability");
  }

  const config = await getProviderRuntimeConfig({ organizationId, provider });
  if (!config.enabled) return skeleton(provider, "provider_disabled", config);
  if (!config.apiKey) return skeleton(provider, "no_credential", config);
  if (config.status && /invalid|error/i.test(config.status)) {
    return skeleton(provider, "invalid_credential", config);
  }

  if (budgetCheck) {
    const budget = await checkBudget({ organization_id: organizationId, provider });
    if (!budget.ok) return skeleton(provider, budget.reason ?? "budget_blocked", config);
  }

  const health = await computeHealth(organizationId, provider);
  return {
    provider,
    config,
    priority: config.priority ?? 100,
    health: health.score,
    avgLatencyMs: health.avgLatencyMs,
    eligible: true,
  };
}

function skeleton(
  provider: string,
  reason: string,
  config?: RuntimeConfig,
): CandidateProvider {
  return {
    provider,
    config:
      config ?? {
        provider,
        organizationId: null,
        apiKey: null,
        baseUrl: null,
        credentialSource: "unavailable",
        timeoutMs: null,
        priority: null,
        dailyLimit: null,
        monthlyLimit: null,
        enabled: false,
        status: null,
      },
    priority: config?.priority ?? 999,
    health: 0,
    avgLatencyMs: 0,
    skipReason: reason,
    eligible: false,
  };
}

export async function diagnoseProviders(opts: SelectOptions): Promise<CandidateProvider[]> {
  const defaults = DEFAULT_CAPABILITY_ORDER[opts.capability] ?? [];
  return Promise.all(
    defaults.map((p) =>
      evaluate(opts.organizationId, p, opts.capability, opts.budgetCheck ?? true),
    ),
  );
}