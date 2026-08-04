// Central runtime config resolver. Server-only. Never expose secret to client.
//
// Wraps `resolveProviderCredential` and adds:
//   - normalized shape (apiKey / baseUrl / credentialSource / status metadata)
//   - `logProviderUsage()` helper writing to `provider_usage_events`
//
// All adapters MUST go through this helper. Never read `process.env.*_API_KEY`
// directly outside of `resolve-credential.server.ts`.

import { resolveProviderCredential, type CredentialSource } from "./resolve-credential.server";

export interface RuntimeConfig {
  provider: string;
  organizationId: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  credentialSource: CredentialSource;
  timeoutMs: number | null;
  priority: number | null;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  enabled: boolean;
  status: string | null;
}

export interface RuntimeConfigInput {
  organizationId: string | null | undefined;
  provider: string;
}

export async function getProviderRuntimeConfig(
  input: RuntimeConfigInput,
): Promise<RuntimeConfig> {
  const { organizationId, provider } = input;

  // Base credential from Org → Platform → Legacy env → unavailable.
  const resolved = await resolveProviderCredential(organizationId ?? null, provider);

  let priority: number | null = null;
  let timeoutMs: number | null = null;
  let dailyLimit: number | null = null;
  let monthlyLimit: number | null = null;
  let enabled = true;
  let status: string | null = null;

  if (organizationId && resolved.source === "organization") {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("provider_credentials")
        .select("priority, daily_limit, monthly_limit, enabled, status")
        .eq("organization_id", organizationId)
        .eq("provider", provider)
        .maybeSingle();
      if (data) {
        priority = (data as any).priority ?? null;
        dailyLimit = (data as any).daily_limit ?? null;
        monthlyLimit = (data as any).monthly_limit ?? null;
        enabled = Boolean((data as any).enabled ?? true);
        status = (data as any).status ?? null;
      }
    } catch {
      // metadata is best-effort; do not fail resolution because of it
    }
  }

  return {
    provider,
    organizationId: organizationId ?? null,
    apiKey: resolved.apiKey ?? null,
    baseUrl: resolved.baseUrl ?? null,
    credentialSource: resolved.source,
    timeoutMs,
    priority,
    dailyLimit,
    monthlyLimit,
    enabled,
    status,
  };
}

export interface UsageLogInput {
  organizationId: string;
  provider: string;
  operation: string;
  credentialSource: CredentialSource;
  success: boolean;
  durationMs?: number;
  errorCode?: string | null;
  units?: number;
  estimatedCost?: number;
  metadata?: Record<string, unknown>;
  prospectingResultId?: string | null;
  prospectingSearchId?: string | null;
}

/**
 * Record a provider usage event. Never persists the API key. Callers pass the
 * credential_source obtained from `getProviderRuntimeConfig()` so the log
 * reflects which credential path was actually used at runtime.
 */
export async function logProviderUsage(input: UsageLogInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const meta: Record<string, unknown> = {
      ...(input.metadata ?? {}),
      credential_source: input.credentialSource,
      duration_ms: input.durationMs ?? null,
      error_code: input.errorCode ?? null,
    };
    await supabaseAdmin.from("provider_usage_events").insert({
      organization_id: input.organizationId,
      provider: input.provider,
      operation: input.operation,
      success: input.success,
      units: input.units ?? 1,
      estimated_cost: input.estimatedCost ?? null,
      prospecting_result_id: input.prospectingResultId ?? null,
      prospecting_search_id: input.prospectingSearchId ?? null,
      metadata: meta as any,
    });
  } catch {
    // best-effort logging; never break the caller
  }
}
