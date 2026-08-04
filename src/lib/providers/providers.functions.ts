// Server functions for the tenant provider center. Admin/SuperAdmin only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDER_CATALOG } from "./catalog";

async function requireAdmin(context: any): Promise<{ orgId: string; userId: string; isSuper: boolean }> {
  const { supabase, userId } = context;
  const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  const orgId = (profile as any)?.organization_id;
  if (!orgId) throw new Error("no_organization");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const list = ((roles ?? []) as any[]).map((r) => r.role);
  const isSuper = list.includes("superadmin");
  const isAdmin = isSuper || list.includes("admin");
  if (!isAdmin) throw new Error("forbidden");
  return { orgId, userId, isSuper };
}

/**
 * Alterna apenas o flag `enabled` da credencial. Preserva o secret cifrado, a
 * URL base e todas as configurações. Este é o caminho correto para
 * "desativar/ativar" um provedor — NÃO usar `deleteProviderCredential` para
 * pausar temporariamente.
 */
export const setProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ provider: z.string().min(1), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { orgId, userId } = await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("provider_credentials")
      .update({ enabled: data.enabled })
      .eq("organization_id", orgId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("provider_audit_log").insert({
      organization_id: orgId,
      user_id: userId,
      provider: data.provider,
      action: data.enabled ? "provider_enabled" : "provider_disabled",
      result: "ok",
      metadata: {},
    });
    return { ok: true };
  });

export const listProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { orgId } = await requireAdmin(context);
    const { supabase } = context;
    const { data: settings } = await supabase
      .from("app_settings")
      .select("tenant_provider_settings_enabled")
      .eq("organization_id", orgId)
      .maybeSingle();
    const flag = Boolean((settings as any)?.tenant_provider_settings_enabled);
    const { data: creds } = await supabase
      .from("provider_credentials")
      .select("provider, credential_mode, enabled, priority, status, last4, base_url, last_test_at, last_success_at, last_error_code, updated_at, daily_limit, monthly_limit")
      .eq("organization_id", orgId);
    const byProv = new Map<string, any>((creds ?? []).map((c: any) => [c.provider, c]));
    return {
      flag_enabled: flag,
      providers: PROVIDER_CATALOG.map((p) => ({
        ...p,
        credential: byProv.get(p.id) ?? null,
      })),
    };
  });

const saveInput = z.object({
  provider: z.string().min(1),
  mode: z.enum(["organization", "platform", "disabled"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.literal("")),
  priority: z.number().int().min(1).max(1000).optional(),
  enabled: z.boolean().optional(),
  daily_limit: z.number().int().nonnegative().optional(),
  monthly_limit: z.number().int().nonnegative().optional(),
});

export const saveProviderCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { orgId, userId } = await requireAdmin(context);
    const meta = PROVIDER_CATALOG.find((p) => p.id === data.provider);
    if (!meta) throw new Error("unknown_provider");
    if (!meta.adapterAvailable) throw new Error("adapter_not_available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sealSecret, last4, makeReference } = await import("./vault.server");

    // Load existing to allow preserving current key when apiKey is empty
    const { data: existing } = await supabaseAdmin
      .from("provider_credentials")
      .select("id, encrypted_secret_reference, last4")
      .eq("organization_id", orgId)
      .eq("provider", data.provider)
      .maybeSingle();

    let reference = (existing as any)?.encrypted_secret_reference ?? null;
    let last4Value = (existing as any)?.last4 ?? null;

    if (data.apiKey && data.apiKey.length > 0) {
      reference = makeReference(orgId, data.provider);
      const sealed = sealSecret(data.apiKey);
      last4Value = last4(data.apiKey);
      await supabaseAdmin.from("provider_secret_vault").upsert({
        reference,
        ciphertext: `\\x${sealed.ciphertext.toString("hex")}`,
        iv: `\\x${sealed.iv.toString("hex")}`,
        auth_tag: `\\x${sealed.authTag.toString("hex")}`,
        organization_id: orgId,
        provider: data.provider,
      });
    }

    const row = {
      organization_id: orgId,
      provider: data.provider,
      credential_mode: data.mode,
      enabled: data.enabled ?? true,
      priority: data.priority ?? 100,
      base_url: data.baseUrl || meta.defaultBaseUrl || null,
      encrypted_secret_reference: reference,
      last4: last4Value,
      daily_limit: data.daily_limit ?? null,
      monthly_limit: data.monthly_limit ?? null,
      status: "unknown",
      created_by: userId,
    };

    if (existing) {
      await supabaseAdmin.from("provider_credentials").update(row).eq("id", (existing as any).id);
    } else {
      await supabaseAdmin.from("provider_credentials").insert(row);
    }

    await supabaseAdmin.from("provider_audit_log").insert({
      organization_id: orgId,
      user_id: userId,
      provider: data.provider,
      action: existing ? "credential_updated" : "credential_created",
      result: "ok",
      metadata: { mode: data.mode, enabled: row.enabled, priority: row.priority },
    });

    return { ok: true, last4: last4Value };
  });

export const deleteProviderCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ provider: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { orgId, userId } = await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { makeReference } = await import("./vault.server");
    const reference = makeReference(orgId, data.provider);
    await supabaseAdmin.from("provider_secret_vault").delete().eq("reference", reference);
    await supabaseAdmin.from("provider_credentials").delete()
      .eq("organization_id", orgId).eq("provider", data.provider);
    await supabaseAdmin.from("provider_audit_log").insert({
      organization_id: orgId, user_id: userId, provider: data.provider,
      action: "credential_deleted", result: "ok", metadata: {},
    });
    return { ok: true };
  });

export const testProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ provider: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { orgId, userId } = await requireAdmin(context);
    const { resolveProviderCredential } = await import("./resolve-credential.server");
    const { healthCheck } = await import("./health-check.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const resolved = await resolveProviderCredential(orgId, data.provider);
    if (resolved.source === "unavailable" || !resolved.apiKey) {
      await supabaseAdmin.from("provider_audit_log").insert({
        organization_id: orgId, user_id: userId, provider: data.provider,
        action: "test_connection", result: "unavailable",
        metadata: { credential_source: resolved.source },
      });
      return { result: "unavailable" as const, latency_ms: 0, message: "Nenhuma credencial configurada.", source: resolved.source };
    }

    const outcome = await healthCheck(data.provider, resolved.apiKey, resolved.baseUrl);

    await supabaseAdmin.from("provider_credentials")
      .update({
        status: outcome.result,
        last_test_at: new Date().toISOString(),
        ...(outcome.result === "connected" ? { last_success_at: new Date().toISOString(), last_error_code: null, last_error_message: null } : { last_error_code: outcome.result, last_error_message: outcome.message }),
      })
      .eq("organization_id", orgId).eq("provider", data.provider);

    await supabaseAdmin.from("provider_audit_log").insert({
      organization_id: orgId, user_id: userId, provider: data.provider,
      action: "test_connection", result: outcome.result,
      metadata: { credential_source: resolved.source, latency_ms: outcome.latency_ms },
    });

    return { result: outcome.result, latency_ms: outcome.latency_ms, message: outcome.message, source: resolved.source };
  });