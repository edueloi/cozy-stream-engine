import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emptyCompany, type NormalizedCompany } from "../normalizer";
import { checkBudget, isDataEngineEnabled } from "../cache.server";
import { orderProviders, type ProviderScore } from "./strategy.server";
import { estimatePlanDurationMs } from "./eta";
import type { EnrichmentInput, EnrichmentPlan, PlanStep } from "./interfaces";

const DEFAULT_REQUIRED: Array<keyof NormalizedCompany> = ["company_name", "cnpj"];
const DEFAULT_OPTIONAL: Array<keyof NormalizedCompany> = [
  "website", "phone", "email", "linkedin", "instagram",
  "city", "state", "segment", "employees", "decision_makers",
];

const CAPABILITY_FIELDS: Record<string, string[]> = {
  company_search: ["company_name", "cnpj"],
  company_enrichment: ["legal_name", "segment", "employees", "capital", "city", "state", "address"],
  company_website: ["website"],
  company_email: ["email"],
  company_phone: ["phone"],
  company_linkedin: ["linkedin"],
  company_instagram: ["instagram"],
  social_profiles: ["linkedin", "instagram"],
  contact_enrichment: ["email", "phone"],
  decision_makers: ["decision_makers"],
  professional_profile: ["decision_makers"],
};

const PARALLEL_GROUPS: Record<string, number> = {
  company_enrichment: 0,
  company_website: 1, company_email: 1, company_phone: 1,
  company_linkedin: 1, company_instagram: 1, social_profiles: 1, contact_enrichment: 1,
  decision_makers: 2, professional_profile: 2,
};

function fieldFilled(c: Partial<NormalizedCompany>, f: string): boolean {
  const v = (c as any)[f];
  if (Array.isArray(v)) return v.length > 0;
  return v != null && v !== "";
}

export async function buildEnrichmentPlan(input: EnrichmentInput): Promise<EnrichmentPlan> {
  const flag = await isDataEngineEnabled(input.organization_id);
  const strategy = input.strategy ?? "Balanced";
  const required = input.required_fields ?? DEFAULT_REQUIRED;
  const optional = input.optional_fields ?? DEFAULT_OPTIONAL;
  const seed = { ...emptyCompany("seed"), ...(input.seed ?? {}) } as NormalizedCompany;
  if (input.cnpj) seed.cnpj = input.cnpj.replace(/\D/g, "");

  const allFields = Array.from(new Set([...required, ...optional]));
  const existentes = allFields.filter((f) => fieldFilled(seed, f as string));
  const faltantes = allFields.filter((f) => !fieldFilled(seed, f as string));
  const obrigatoriosPendentes = (required as string[]).filter((f) => !fieldFilled(seed, f));

  if (!flag) {
    return {
      organization_id: input.organization_id,
      cnpj: seed.cnpj,
      strategy,
      campos_existentes: existentes as string[],
      campos_faltantes: faltantes as string[],
      criterios_obrigatorios: required as string[],
      criterios_pendentes: obrigatoriosPendentes,
      providers_selecionados: [],
      ordem_execucao: [],
      custo_estimado: 0,
      tempo_estimado_ms: 0,
      condicoes_de_parada: ["feature_flag_off"],
      feature_flag_ok: false,
      reason_if_blocked: "jcs_data_engine_enabled=false",
    };
  }

  const { data: caps } = await supabaseAdmin
    .from("provider_capabilities")
    .select("provider, capability, enabled, credits_cost, priority, success_rate, quality")
    .eq("enabled", true);

  const capsList = (caps ?? []) as any[];
  const steps: PlanStep[] = [];
  const providersUsed = new Set<string>();
  let cost = 0;
  let etaMs = 0;

  for (const [capability, targetFields] of Object.entries(CAPABILITY_FIELDS)) {
    const needed = targetFields.filter((f) => faltantes.includes(f as any));
    if (needed.length === 0) continue;
    const candidates = capsList.filter((c) => c.capability === capability);
    if (candidates.length === 0) continue;

    const scored: ProviderScore[] = [];
    for (const c of candidates) {
      const b = await checkBudget({ organization_id: input.organization_id, provider: c.provider });
      scored.push({
        provider: c.provider,
        capability,
        cost: Number(c.credits_cost ?? 1),
        quality: Number(c.quality ?? 70),
        priority: Number(c.priority ?? 100),
        success_rate: Number(c.success_rate ?? 0.8),
        enabled: Boolean(c.enabled),
        budget_ok: b.ok,
      });
    }
    const ordered = orderProviders(strategy, scored);
    if (ordered.length === 0) continue;

    const providers = ordered.map((o) => o.provider);
    providers.forEach((p) => providersUsed.add(p));
    const est = ordered[0].cost;
    cost += est;
    etaMs += 1500;

    steps.push({
      capability,
      providers,
      fields_target: needed,
      parallel_group: PARALLEL_GROUPS[capability] ?? 99,
      cache_key: seed.cnpj ? { key_type: "cnpj", key_value: seed.cnpj, field: capability } : undefined,
      estimated_cost: est,
      required: needed.some((f) => (required as string[]).includes(f)),
    });
  }

  steps.sort((a, b) => a.parallel_group - b.parallel_group);

  const timeout_ms_per_step = input.timeout_ms_per_step ?? 15000;
  const max_parallel = input.max_parallel ?? 3;
  etaMs = estimatePlanDurationMs(steps, { timeout_ms_per_step, max_parallel });

  return {
    organization_id: input.organization_id,
    cnpj: seed.cnpj,
    strategy,
    campos_existentes: existentes as string[],
    campos_faltantes: faltantes as string[],
    criterios_obrigatorios: required as string[],
    criterios_pendentes: obrigatoriosPendentes,
    providers_selecionados: Array.from(providersUsed),
    ordem_execucao: steps,
    custo_estimado: cost,
    tempo_estimado_ms: etaMs,
    condicoes_de_parada: [
      "quality_reached", "required_fields_complete", "budget_exhausted",
      "provider_unavailable", "feature_flag_off",
    ],
    feature_flag_ok: true,
  };
}