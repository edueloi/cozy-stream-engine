import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listEmailConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("email_connections")
      .select("id, provider, email, sender_name, signature, enabled, expires_at, created_at, updated_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const startEmailOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: "google" | "microsoft" }) =>
    z.object({ provider: z.enum(["google", "microsoft"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signState } = await import("@/lib/calendar.server");
    const { googleEmailAuthUrl, microsoftEmailAuthUrl } = await import("@/lib/email.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Usuário sem empresa associada.");
    const host = getRequestHost();
    if (!host) throw new Error("Sem host de origem");
    const proto = host.includes("localhost") ? "http" : "https";
    // Microsoft OAuth exige redirect_uri idêntico ao registrado no App Registration.
    // canônica publicada para o provider Microsoft. Google mantém host atual.
    const canonicalBase = (process.env.EMAIL_OAUTH_REDIRECT_BASE ?? "http://localhost:3000").replace(/\/$/, "");
    const redirectUri = data.provider === "microsoft"
      ? `${canonicalBase}/api/public/email/oauth/callback`
      : `${proto}://${host}/api/public/email/oauth/callback`;
    console.log("[ms-oauth:email] start provider=%s user=%s redirect_uri=%s", data.provider, context.userId, redirectUri);
    const state = signState({ user_id: context.userId, organization_id: orgId, provider: data.provider, kind: "email" });
    if (data.provider === "google") {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      if (!clientId) throw new Error("Integração com Google indisponível no momento.");
      return { url: googleEmailAuthUrl({ clientId, redirectUri, state }) };
    }
    const msClientId = process.env.MS_OAUTH_CLIENT_ID;
    if (!msClientId) throw new Error("Integração com Microsoft indisponível no momento.");
    return { url: microsoftEmailAuthUrl({ clientId: msClientId, tenant: process.env.MS_OAUTH_TENANT ?? "common", redirectUri, state }) };
  });

export const disconnectEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: "google" | "microsoft" }) =>
    z.object({ provider: z.enum(["google", "microsoft"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("email_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const prefsSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  sender_name: z.string().max(200).optional(),
  signature: z.string().max(4000).optional(),
  enabled: z.boolean().optional(),
});
export const updateEmailPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof prefsSchema>) => prefsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (typeof data.sender_name === "string") patch.sender_name = data.sender_name;
    if (typeof data.signature === "string") patch.signature = data.signature;
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    const { error } = await context.supabase
      .from("email_connections")
      .update(patch as never)
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrgEmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_org_email_status");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      user_id: string;
      name: string | null;
      email: string | null;
      provider: string | null;
      connected: boolean;
      external_email: string | null;
      expires_at: string | null;
      updated_at: string | null;
    }>;
  });
