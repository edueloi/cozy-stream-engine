import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireLocalAuth } from "@/lib/local-auth-middleware";
import { prisma } from "@/lib/db/client";
import { getCurrentOrganizationId } from "@/lib/db/tenant";

const SENSITIVE_KEYS = [
  "whatsapp_api_key",
  "smtp_pass",
  "apify_token",
  "sip_password",
  "google_oauth_client_secret",
  "ms_oauth_client_secret",
] as const;

function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return "••••" + value.slice(-4);
}

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .handler(async ({ context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    const rows = await prisma.$queryRawUnsafe<Array<{ config: unknown }>>(
      "SELECT config FROM app_settings WHERE organization_id = ? LIMIT 1", organizationId,
    );
    const data = rows[0]?.config && typeof rows[0].config === "object" ? rows[0].config as Record<string, unknown> : {};
    return {
      ...data,
      whatsapp_api_key: "",
      smtp_pass: "",
      apify_token: "",
      sip_password: "",
      google_oauth_client_secret: "",
      ms_oauth_client_secret: "",
      whatsapp_api_key_masked: maskSecret(data.whatsapp_api_key as string),
      smtp_pass_masked: maskSecret(data.smtp_pass as string),
      apify_token_masked: maskSecret(data.apify_token as string),
      sip_password_masked: maskSecret(data.sip_password as string),
      google_oauth_client_secret_masked: maskSecret(data.google_oauth_client_secret as string),
      ms_oauth_client_secret_masked: maskSecret(data.ms_oauth_client_secret as string),
    };
  });

// Returns SIP credentials (including password) for the in-browser softphone.
// Kept separate from getSettings so the password is never sent to the
// settings form / cached in the general settings query.
export const getSipCredentials = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .handler(async () => null);

const updateSchema = z.object({
  agent_name: z.string().optional(),
  agent_personality: z.string().optional(),
  agent_product: z.string().optional(),
  agent_objections: z.string().optional(),
  icp_segmentos: z.array(z.string()).optional(),
  icp_cidades: z.array(z.string()).optional(),
  whatsapp_instance_url: z.string().optional(),
  whatsapp_instance_name: z.string().optional(),
  whatsapp_api_key: z.string().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.coerce.number().int().optional(),
  smtp_user: z.string().optional(),
  smtp_pass: z.string().optional(),
  smtp_from_email: z.string().optional(),
  smtp_from_name: z.string().optional(),
  apify_token: z.string().optional(),
  apify_actor_id: z.string().optional(),
  twilio_from_number: z.string().optional(),
  booking_link: z.string().optional(),
  llm_model: z.string().optional(),
  sip_server: z.string().optional(),
  sip_ws_url: z.string().optional(),
  sip_username: z.string().optional(),
  sip_password: z.string().optional(),
  sip_domain: z.string().optional(),
  sip_display_name: z.string().optional(),
  whatsapp_daily_limit: z.coerce.number().int().optional(),
  whatsapp_send_window_start: z.coerce.number().int().optional(),
  whatsapp_send_window_end: z.coerce.number().int().optional(),
  whatsapp_min_interval_seconds: z.coerce.number().int().optional(),
  send_days: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  reengage_enabled: z.boolean().optional(),
  reengage_after_days: z.coerce.number().int().optional(),
  lost_recover_enabled: z.boolean().optional(),
  ab_enabled: z.boolean().optional(),
  smtp_use_ssl: z.boolean().optional(),
  smtp_use_tls: z.boolean().optional(),
  smtp_auth_enabled: z.boolean().optional(),
  auto_cadence_enabled: z.boolean().optional(),
  auto_cadence_default_agent_id: z.string().uuid().nullable().optional(),
  google_oauth_client_id: z.string().optional(),
  google_oauth_client_secret: z.string().optional(),
  ms_oauth_client_id: z.string().optional(),
  ms_oauth_client_secret: z.string().optional(),
  ms_oauth_tenant: z.string().optional(),
  inbound_enabled: z.boolean().optional(),
  inbound_business_hours_enabled: z.boolean().optional(),
  inbound_create_lead_automatically: z.boolean().optional(),
  inbound_pause_cadence_on_message: z.boolean().optional(),
  inbound_support_mode_enabled: z.boolean().optional(),
  inbound_default_agent_id: z.string().uuid().nullable().optional(),
  inbound_handoff_user_id: z.string().uuid().nullable().optional(),
  inbound_after_hours_message: z.string().optional(),
  max_inbound_interactions: z.coerce.number().int().optional(),
});

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: z.infer<typeof updateSchema>) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { ...data };
    for (const k of SENSITIVE_KEYS) {
      if (!patch[k]) delete patch[k];
    }
    const organizationId = await getCurrentOrganizationId(context.userId);
    const rows = await prisma.$queryRawUnsafe<Array<{ config: unknown }>>(
      "SELECT config FROM app_settings WHERE organization_id = ? LIMIT 1", organizationId,
    );
    const current = rows[0]?.config && typeof rows[0].config === "object" ? rows[0].config as Record<string, unknown> : {};
    const config = JSON.stringify({ ...current, ...patch });
    await prisma.$executeRawUnsafe(
      "INSERT INTO app_settings (organization_id, config) VALUES (?, CAST(? AS JSON)) ON DUPLICATE KEY UPDATE config = VALUES(config)",
      organizationId,
      config,
    );
    return { ok: true };
  });

export const rotateInboundToken = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .handler(async ({ context }) => {
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data: orgIdData } = await context.supabase.rpc("current_org_id");
    const orgId = orgIdData as string | null;
    if (!orgId) throw new Error("Usuário sem empresa associada.");
    const { error } = await context.supabase
      .from("app_settings")
      .update({ inbound_token: newToken } as never)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true, inbound_token: newToken };
  });

export const testSmtp = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: { to: string }) =>
    z.object({ to: z.string().email() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isManager } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isManager) throw new Error("Apenas gerentes podem testar SMTP.");
    const { data: orgIdData } = await context.supabase.rpc("current_org_id");
    const orgId = orgIdData as string | null;
    if (!orgId) throw new Error("Usuário sem empresa associada.");
    const { data: s, error } = await context.supabase
      .from("app_settings")
      .select(
        "smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email, smtp_from_name, smtp_from, smtp_use_ssl, smtp_use_tls, smtp_auth_enabled",
      )
      .eq("organization_id", orgId)
      .single();
    if (error) throw new Error(error.message);
    const fromEmail = s.smtp_from_email || s.smtp_from;
    if (!s.smtp_host || !s.smtp_port || !fromEmail) {
      throw new Error("Configure host, porta e remetente antes de testar.");
    }
    if (s.smtp_auth_enabled !== false && (!s.smtp_user || !s.smtp_pass)) {
      throw new Error("Autenticação ativada exige usuário e senha.");
    }
    const { sendEmail } = await import("@/lib/smtp.server");
    try {
      const r = await sendEmail(
        {
          host: s.smtp_host,
          port: s.smtp_port,
          user: s.smtp_user ?? "",
          pass: s.smtp_pass ?? "",
          fromEmail,
          fromName: s.smtp_from_name,
          useSsl: s.smtp_use_ssl ?? undefined,
          useTls: s.smtp_use_tls ?? undefined,
          authEnabled: s.smtp_auth_enabled ?? undefined,
        },
        data.to,
        "Teste SMTP - JCS SDR",
        "Este é um email de teste enviado a partir das suas configurações SMTP. Se você recebeu, sua configuração está funcionando!",
      );
      return { ok: true, messageId: r.externalId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

export const configureEvolutionWebhook = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: { webhookUrl: string }) =>
    z.object({ webhookUrl: z.string().url() }).parse(input),
  )
  .handler(async () => {
    throw new Error("A configuração automática do webhook será habilitada após a integração local do WhatsApp.");
    const { data: orgIdData } = await context.supabase.rpc("current_org_id");
    const orgId = orgIdData as string | null;
    if (!orgId) throw new Error("Usuário sem empresa associada.");
    const { data: cfg, error } = await context.supabase
      .from("app_settings")
      .select("whatsapp_instance_url, whatsapp_instance_name, whatsapp_api_key, whatsapp_webhook_token")
      .eq("organization_id", orgId)
      .single();
    if (error) throw new Error(error.message);
    if (!cfg?.whatsapp_instance_url || !cfg.whatsapp_instance_name || !cfg.whatsapp_api_key) {
      throw new Error("Configure URL, nome da instância e API key antes.");
    }
    if (!cfg.whatsapp_webhook_token) {
      throw new Error("Salve as configurações uma vez para gerar o token.");
    }
    const base = cfg.whatsapp_instance_url.replace(/\/$/, "");
    const url = `${base}/webhook/set/${encodeURIComponent(cfg.whatsapp_instance_name)}`;
    const fullWebhookUrl = `${data.webhookUrl}?token=${encodeURIComponent(cfg.whatsapp_webhook_token)}`;
    const events = [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE",
    ];
    // Evolution v2 wrapped shape
    const payload = {
      webhook: {
        enabled: true,
        url: fullWebhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events,
      },
    };
    const doPost = async (body: unknown) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.whatsapp_api_key! },
        body: JSON.stringify(body),
      });
    let res = await doPost(payload);
    let text = await res.text();
    if (!res.ok) {
      // Fallback: flat shape (older Evolution)
      res = await doPost({
        url: fullWebhookUrl,
        enabled: true,
        webhook_by_events: false,
        webhook_base64: false,
        events,
      });
      text = await res.text();
      if (!res.ok) {
        throw new Error(`Evolution ${res.status}: ${text.slice(0, 300)}`);
      }
    }
    return { ok: true, webhookUrl: fullWebhookUrl, response: text.slice(0, 500) };
  });

// ============================================================
// Evolution: criar instância + QR + estado da conexão
// ============================================================

async function loadEvolutionCfg(supabase: any) {
  const { data: orgIdData } = await supabase.rpc("current_org_id");
  const orgId = orgIdData as string | null;
  if (!orgId) throw new Error("Usuário sem empresa associada.");
  const { data: cfg, error } = await supabase
    .from("app_settings")
    .select("whatsapp_instance_url, whatsapp_instance_name, whatsapp_api_key, whatsapp_webhook_token")
    .eq("organization_id", orgId)
    .single();
  if (error) throw new Error(error.message);
  if (!cfg?.whatsapp_instance_url || !cfg.whatsapp_instance_name || !cfg.whatsapp_api_key) {
    throw new Error("Preencha URL, nome da instância e API Key antes de conectar.");
  }
  return { orgId, cfg, base: cfg.whatsapp_instance_url.replace(/\/$/, "") };
}

export const createEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: { webhookUrl: string }) =>
    z.object({ webhookUrl: z.string().url() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { cfg, base } = await loadEvolutionCfg(context.supabase);
    const fullWebhookUrl = cfg.whatsapp_webhook_token
      ? `${data.webhookUrl}?token=${encodeURIComponent(cfg.whatsapp_webhook_token)}`
      : data.webhookUrl;

    const headers = { "Content-Type": "application/json", apikey: cfg.whatsapp_api_key! };
    const events = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"];

    // 1) Try to create the instance. If it already exists, ignore the 403/409 and proceed to /connect.
    const createBody = {
      instanceName: cfg.whatsapp_instance_name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: fullWebhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events,
      },
    };
    const createRes = await fetch(`${base}/instance/create`, {
      method: "POST",
      headers,
      body: JSON.stringify(createBody),
    });
    const createText = await createRes.text();
    let created: any = null;
    try { created = JSON.parse(createText); } catch { /* not JSON */ }

    // 2) Always fetch QR via /instance/connect/{name} for a fresh code.
    const connectRes = await fetch(
      `${base}/instance/connect/${encodeURIComponent(cfg.whatsapp_instance_name!)}`,
      { method: "GET", headers },
    );
    const connectText = await connectRes.text();
    let connect: any = null;
    try { connect = JSON.parse(connectText); } catch { /* not JSON */ }

    const qrBase64: string | null =
      connect?.base64 ||
      connect?.qrcode?.base64 ||
      created?.qrcode?.base64 ||
      created?.qr?.base64 ||
      null;
    const pairingCode: string | null =
      connect?.pairingCode || created?.qrcode?.pairingCode || null;

    if (!qrBase64 && !pairingCode && !connectRes.ok && !createRes.ok) {
      throw new Error(
        `Evolution não retornou QR. create=${createRes.status} ${createText.slice(0, 200)} | connect=${connectRes.status} ${connectText.slice(0, 200)}`,
      );
    }
    return { qrBase64, pairingCode };
  });

export const getEvolutionConnectionState = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .handler(async ({ context }) => {
    const { cfg, base } = await loadEvolutionCfg(context.supabase);
    const headers = { apikey: cfg.whatsapp_api_key! };
    const res = await fetch(
      `${base}/instance/connectionState/${encodeURIComponent(cfg.whatsapp_instance_name!)}`,
      { headers },
    );
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    const state: string =
      parsed?.instance?.state || parsed?.state || parsed?.status || "unknown";
    return { state, raw: text.slice(0, 300) };
  });

export const logoutEvolutionInstance = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .handler(async ({ context }) => {
    const { cfg, base } = await loadEvolutionCfg(context.supabase);
    const headers = { apikey: cfg.whatsapp_api_key! };
    const res = await fetch(
      `${base}/instance/logout/${encodeURIComponent(cfg.whatsapp_instance_name!)}`,
      { method: "DELETE", headers },
    );
    return { ok: res.ok, status: res.status };
  });
