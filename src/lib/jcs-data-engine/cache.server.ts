// JCS Data Engine — cache + usage helpers. Server-only.
// Nunca importar do bundle do cliente.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DAYS = 24 * 60 * 60 * 1000;

export const CACHE_TTL_MS: Record<string, number> = {
  company: 90 * DAYS,
  decision_maker: 30 * DAYS,
  phone: 30 * DAYS,
  email: 30 * DAYS,
  linkedin: 30 * DAYS,
  instagram: 30 * DAYS,
};

export async function readCache(params: {
  organization_id: string;
  key_type: string;
  key_value: string;
  field: string;
}): Promise<unknown | null> {
  const { data } = await supabaseAdmin
    .from("enrichment_cache")
    .select("value, expires_at")
    .eq("organization_id", params.organization_id)
    .eq("key_type", params.key_type)
    .eq("key_value", params.key_value)
    .eq("field", params.field)
    .maybeSingle();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.value;
}

export async function writeCache(params: {
  organization_id: string;
  key_type: string;
  key_value: string;
  field: string;
  value: unknown;
  provider: string;
  ttl_ms?: number;
}): Promise<void> {
  const ttl = params.ttl_ms ?? CACHE_TTL_MS[params.field] ?? CACHE_TTL_MS.company;
  const expires_at = new Date(Date.now() + ttl).toISOString();
  await supabaseAdmin.from("enrichment_cache").upsert(
    {
      organization_id: params.organization_id,
      key_type: params.key_type,
      key_value: params.key_value,
      field: params.field,
      value: params.value as any,
      provider: params.provider,
      fetched_at: new Date().toISOString(),
      expires_at,
    },
    { onConflict: "organization_id,key_type,key_value,field" },
  );
}

export async function logUsage(params: {
  organization_id: string;
  provider: string;
  operation: string;
  success: boolean;
  units?: number;
  estimated_cost?: number;
  estimated_cost_avoided?: number;
  skipped_reason?: string;
  prospecting_result_id?: string;
  prospecting_search_id?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("provider_usage_events").insert({
      organization_id: params.organization_id,
      provider: params.provider,
      operation: params.operation,
      success: params.success,
      units: params.units ?? 1,
      estimated_cost: params.estimated_cost ?? null,
      estimated_cost_avoided: params.estimated_cost_avoided ?? null,
      skipped_reason: params.skipped_reason ?? null,
      prospecting_result_id: params.prospecting_result_id ?? null,
      prospecting_search_id: params.prospecting_search_id ?? null,
      metadata: (params.metadata ?? {}) as any,
    });
  } catch (e) {
    // usage logging nunca deve derrubar o pipeline
    console.error("[jcs-data-engine] logUsage failed", e);
  }
}

// Checa limites diário/mensal a partir do metadata do provider_credentials.
export async function checkBudget(params: {
  organization_id: string;
  provider: string;
}): Promise<{ ok: boolean; reason?: string; daily_used?: number; monthly_used?: number }> {
  const { data: cred } = await supabaseAdmin
    .from("provider_credentials")
    .select("enabled, metadata")
    .eq("provider", params.provider)
    .or(`organization_id.eq.${params.organization_id},organization_id.is.null`)
    .order("organization_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!cred) return { ok: false, reason: "no_credential" };
  if (!cred.enabled) return { ok: false, reason: "credential_disabled" };

  const meta = (cred.metadata ?? {}) as Record<string, any>;
  const daily = Number(meta.daily_limit ?? 0);
  const monthly = Number(meta.monthly_limit ?? 0);
  if (!daily && !monthly) return { ok: true };

  const todayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let daily_used = 0;
  let monthly_used = 0;
  if (daily) {
    const { count } = await supabaseAdmin
      .from("provider_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.organization_id)
      .eq("provider", params.provider)
      .eq("success", true)
      .gte("created_at", todayIso);
    daily_used = count ?? 0;
    if (daily_used >= daily) return { ok: false, reason: "daily_limit", daily_used };
  }
  if (monthly) {
    const { count } = await supabaseAdmin
      .from("provider_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.organization_id)
      .eq("provider", params.provider)
      .eq("success", true)
      .gte("created_at", monthIso);
    monthly_used = count ?? 0;
    if (monthly_used >= monthly) return { ok: false, reason: "monthly_limit", monthly_used };
  }
  return { ok: true, daily_used, monthly_used };
}

export async function isDataEngineEnabled(organization_id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("jcs_data_engine_enabled")
    .eq("organization_id", organization_id)
    .maybeSingle();
  return Boolean((data as any)?.jcs_data_engine_enabled);
}