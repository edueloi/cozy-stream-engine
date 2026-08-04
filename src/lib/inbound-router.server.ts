// Inbound conversation router — handles WhatsApp messages that arrive
// OUTSIDE the outbound cadence flow. This module is invoked only when the
// webhook's classifier decides `route === "inbound"`. The cadence path is
// untouched by anything here.
import { generateText } from "ai";
import { createOpenAiCompatibleProvider, getAiApiKey } from "@/lib/ai-gateway";
import { sendWhatsAppText } from "@/lib/evolution.server";
import {
  classifyMessageOrigin,
  isAutomaticOrigin,
  detectBotLoop,
  hasExplicitMeetingIntent,
  isRepetitiveOutbound,
} from "@/lib/message-classification.server";

type Admin = ReturnType<typeof requireAdmin>;
function requireAdmin(_: unknown): unknown { return _; }

export type InboundIntent =
  | "comercial"
  | "suporte"
  | "financeiro"
  | "cliente_existente"
  | "fornecedor"
  | "parceria"
  | "spam"
  | "humano"
  | "desconhecido";

const INTENTS: InboundIntent[] = [
  "comercial", "suporte", "financeiro", "cliente_existente",
  "fornecedor", "parceria", "spam", "humano", "desconhecido",
];

function parseJsonLoose<T = unknown>(text: string): T | null {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];
  try { return JSON.parse(s) as T; } catch { return null; }
}

export async function classifyInboundIntent(text: string): Promise<InboundIntent> {
  const key = (() => { try { return getAiApiKey(); } catch { return null; } })();
  if (!key) return "desconhecido";
  try {
    const gateway = createOpenAiCompatibleProvider(key);
    const { text: raw } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "Classifique a intenção de uma mensagem inbound recebida no WhatsApp corporativo. " +
        `Responda APENAS JSON no formato {"intent":"<um de: ${INTENTS.join("|")}>"}. ` +
        'Use "comercial" quando pedir orçamento/serviço/informações de produto. ' +
        '"suporte" para problemas técnicos. "financeiro" para boletos/pagamentos. ' +
        '"cliente_existente" quando explicitamente disser que já é cliente. ' +
        '"humano" quando pedir para falar com pessoa. "desconhecido" se incerto.',
      prompt: `Mensagem:\n"""${text}"""`,
    });
    const parsed = parseJsonLoose<{ intent?: string }>(raw);
    const cand = parsed?.intent as InboundIntent | undefined;
    if (cand && INTENTS.includes(cand)) return cand;
    return "desconhecido";
  } catch {
    return "desconhecido";
  }
}

interface OrgSettings {
  organization_id: string;
  inbound_enabled: boolean;
  inbound_default_agent_id: string | null;
  inbound_business_hours_enabled: boolean;
  inbound_after_hours_message: string | null;
  inbound_handoff_user_id: string | null;
  inbound_create_lead_automatically: boolean;
  inbound_support_mode_enabled: boolean;
  max_inbound_interactions: number;
  whatsapp_instance_url: string | null;
  whatsapp_instance_name: string | null;
  whatsapp_api_key: string | null;
  agent_name: string | null;
  booking_link: string | null;
  send_days: number[] | null;
  whatsapp_send_window_start: number | null;
  whatsapp_send_window_end: number | null;
  llm_model: string | null;
}

export async function loadInboundSettings(
  supabaseAdmin: any,
  organizationId: string,
): Promise<OrgSettings | null> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select(
      "organization_id, inbound_enabled, inbound_default_agent_id, inbound_business_hours_enabled, " +
      "inbound_after_hours_message, inbound_handoff_user_id, inbound_create_lead_automatically, " +
      "inbound_support_mode_enabled, max_inbound_interactions, " +
      "whatsapp_instance_url, whatsapp_instance_name, whatsapp_api_key, " +
      "agent_name, booking_link, send_days, " +
      "whatsapp_send_window_start, whatsapp_send_window_end, llm_model",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as OrgSettings | null) ?? null;
}

function isWithinBusinessHours(s: OrgSettings): boolean {
  if (!s.inbound_business_hours_enabled) return true;
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dow = dowMap[parts.find((p) => p.type === "weekday")?.value ?? ""] ?? 1;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 9);
  const days = s.send_days && s.send_days.length ? s.send_days : [1, 2, 3, 4, 5];
  const start = s.whatsapp_send_window_start ?? 8;
  const end = s.whatsapp_send_window_end ?? 20;
  return days.includes(dow) && hour >= start && hour < end;
}

export async function findOrCreateInboundLead(
  supabaseAdmin: any,
  args: { orgId: string; phone: string; settings: OrgSettings },
): Promise<{ leadId: string; created: boolean } | null> {
  const { orgId, phone, settings } = args;
  const digits = phone.replace(/\D/g, "");
  const tail = digits.slice(-11);
  // Normalize to E.164 (assume Brazil if 10-11 digits without country code).
  const e164 =
    digits.length <= 11 ? `+55${digits}` : `+${digits}`;
  const { data: existing } = await supabaseAdmin.rpc("find_lead_by_phone", {
    _org_id: orgId,
    _tail: tail,
  });
  const found = (existing as Array<{ id: string }> | null)?.[0];
  if (found) return { leadId: found.id, created: false };
  if (!settings.inbound_create_lead_automatically) return null;

  // Do not assign to superadmin by default. Only use handoff user if it exists AND is not a superadmin.
  let ownerId: string | null = null;
  if (settings.inbound_handoff_user_id) {
    const { data: isSuper } = await supabaseAdmin.rpc("is_superadmin", {
      _user_id: settings.inbound_handoff_user_id,
    });
    if (!isSuper) ownerId = settings.inbound_handoff_user_id;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("leads")
    .insert({
      organization_id: orgId,
      whatsapp: e164,
      // Leave name blank until the agent extracts it from conversation.
      nome_fantasia: null,
      razao_social: null,
      source: "whatsapp_inbound",
      source_raw: "whatsapp_inbound",
      status: "inbound_in_progress" as never,
      lifecycle_stage: "inbound",
      owner_id: ownerId,
      agent_id: settings.inbound_default_agent_id,
      notes: `Contato inicial via WhatsApp: ${e164}`,
    } as never)
    .select("id")
    .single();
  if (error || !inserted) return null;

  await supabaseAdmin.from("activity_events").insert({
    lead_id: inserted.id,
    organization_id: orgId,
    type: "inbound_lead_created",
    payload: { phone } as never,
  });
  return { leadId: inserted.id, created: true };
}

async function sendReply(
  supabaseAdmin: any,
  args: { orgId: string; leadId: string; phone: string; body: string; settings: OrgSettings; origin: string },
) {
  const { orgId, leadId, phone, body, settings, origin } = args;
  if (!settings.whatsapp_instance_url || !settings.whatsapp_instance_name || !settings.whatsapp_api_key) return;
  try {
    const r = await sendWhatsAppText(
      {
        instanceUrl: settings.whatsapp_instance_url,
        instanceName: settings.whatsapp_instance_name,
        apiKey: settings.whatsapp_api_key,
      },
      phone,
      body,
    );
    await supabaseAdmin.from("messages").insert({
      lead_id: leadId,
      channel: "whatsapp",
      direction: "outbound",
      body,
      status: "sent",
      external_id: r.externalId,
      generated_by_ai: true,
      organization_id: orgId,
      conversation_origin: origin,
    } as never);
  } catch {
    /* never break webhook */
  }
}

export async function handleInboundHandoff(
  supabaseAdmin: any,
  args: {
    orgId: string;
    leadId: string;
    phone: string;
    reason: string;
    settings: OrgSettings;
    customMessage?: string;
  },
) {
  // Standard handoff message — ALWAYS notify the lead before pausing the AI.
  const STANDARD_HANDOFF_MESSAGE =
    "Perfeito, vou encaminhar você agora para um especialista da nossa equipe continuar o atendimento. Ele terá acesso ao histórico da nossa conversa para te ajudar melhor.";
  const msg = args.customMessage ?? STANDARD_HANDOFF_MESSAGE;

  // 1) Notify the lead FIRST — must be sent before pausing the AI.
  await sendReply(supabaseAdmin, {
    orgId: args.orgId,
    leadId: args.leadId,
    phone: args.phone,
    body: msg,
    settings: args.settings,
    origin: "handoff",
  });

  // 2) Determine the seller to hand off to.
  // Preference: existing responsible/owner on the lead → inbound_handoff_user_id
  // (only if that user is NOT a superadmin). Never delete the lead.
  const { data: leadRow } = await supabaseAdmin
    .from("leads")
    .select("owner_id, responsible_user_id")
    .eq("id", args.leadId)
    .maybeSingle();

  let assignedOwner: string | null =
    (leadRow?.responsible_user_id as string | null) ??
    (leadRow?.owner_id as string | null) ??
    null;

  if (!assignedOwner && args.settings.inbound_handoff_user_id) {
    const { data: isSuper } = await supabaseAdmin.rpc("is_superadmin", {
      _user_id: args.settings.inbound_handoff_user_id,
    });
    if (!isSuper) assignedOwner = args.settings.inbound_handoff_user_id;
  }

  // 3) Pause AI, set status = needs_human, keep history intact.
  const update: Record<string, unknown> = {
    status: "needs_human",
    ai_paused: true,
    ai_paused_at: new Date().toISOString(),
    cadence_paused: true,
    handoff_reason: args.reason,
    handoff_at: new Date().toISOString(),
    needs_human: true,
    human_reason: args.reason,
    human_flagged_at: new Date().toISOString(),
  };
  if (assignedOwner) {
    update.owner_id = assignedOwner;
    update.responsible_user_id = assignedOwner;
  }
  await supabaseAdmin
    .from("leads")
    .update(update as never)
    .eq("id", args.leadId);

  // 4) Activity event with the handoff reason and assigned owner.
  await supabaseAdmin.from("activity_events").insert({
    lead_id: args.leadId,
    organization_id: args.orgId,
    type: "inbound_handoff_created",
    payload: { reason: args.reason, assigned_to: assignedOwner } as never,
  });
}

async function generateInboundReply(
  supabaseAdmin: any,
  args: { orgId: string; leadId: string; message: string; settings: OrgSettings; intent: InboundIntent },
): Promise<string> {
  const key = (() => { try { return getAiApiKey(); } catch { return null; } })();
  if (!key) {
    return "Olá! Recebemos sua mensagem e um consultor entrará em contato em breve.";
  }
  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("direction, body")
    .eq("lead_id", args.leadId)
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(10);
  const ordered = (history ?? []).slice().reverse() as Array<{ direction: string; body: string }>;
  const transcript = ordered
    .map((m) => `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${m.body}`)
    .join("\n");

  const goal =
    args.intent === "comercial"
      ? "Qualifique a oportunidade. Pergunte, de forma natural e uma coisa por vez: nome, empresa, cidade, quantidade de computadores, principal necessidade e quem decide sobre TI. Ofereça reunião quando fizer sentido."
      : args.intent === "suporte"
      ? "Verifique educadamente se já é cliente JCS. Se sim, informe que vai encaminhar para o suporte humano."
      : "Cumprimente, entenda a intenção e responda de forma útil e curta.";

  const gateway = createOpenAiCompatibleProvider(key);
  const model = gateway(args.settings.llm_model || "google/gemini-3-flash-preview");
  const { text } = await generateText({
    model,
    system: [
      `Você é ${args.settings.agent_name || "um atendente da JCS"}, respondendo espontaneamente no WhatsApp da JCS.`,
      "Empresa: JCS — sede em Tatuí/SP. Atendimento nacional.",
      "Canal: WhatsApp. Mensagem curta (até 350 caracteres), tom humano, sem markdown, sem emojis exagerados.",
      "Português do Brasil. Nunca minta. Nunca invente dados do cliente.",
      goal,
      args.settings.booking_link ? `Link de agendamento (só use se pedirem): ${args.settings.booking_link}` : "",
    ].filter(Boolean).join("\n"),
    prompt: `Histórico da conversa até agora:\n${transcript}\n\nÚltima mensagem do cliente:\n"""${args.message}"""\n\nResponda em português.`,
  });
  return text.trim().slice(0, 900);
}

/**
 * Main entry. Returns true when the router handled the message (webhook should
 * short-circuit); false to let the caller continue with the existing cadence path.
 */
export async function handleInboundMessage(
  supabaseAdmin: any,
  args: {
    orgId: string;
    phone: string;
    text: string;
    externalId?: string | null;
    leadId: string | null;
    rawPayload: unknown;
  },
): Promise<boolean> {
  const settings = await loadInboundSettings(supabaseAdmin, args.orgId);
  if (!settings || !settings.inbound_enabled) return false;

  let leadId = args.leadId;
  let createdNow = false;
  if (!leadId) {
    const r = await findOrCreateInboundLead(supabaseAdmin, {
      orgId: args.orgId,
      phone: args.phone,
      settings,
    });
    if (!r) return false;
    leadId = r.leadId;
    createdNow = r.created;
  }

  // Idempotency check (mirrors the cadence webhook).
  if (args.externalId) {
    const { data: existing } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("external_id", args.externalId)
      .maybeSingle();
    if (existing) return true;
  }

  // Persist the inbound message.
  const messageOrigin = classifyMessageOrigin(args.text);
  const isAutomatic = isAutomaticOrigin(messageOrigin);
  await supabaseAdmin.from("messages").insert({
    lead_id: leadId,
    organization_id: args.orgId,
    channel: "whatsapp",
    direction: "inbound",
    body: args.text,
    status: "received",
    external_id: args.externalId ?? null,
    conversation_origin: isAutomatic ? messageOrigin : "inbound",
    raw_response: args.rawPayload as never,
  } as never);

  await supabaseAdmin.from("activity_events").insert({
    lead_id: leadId,
    organization_id: args.orgId,
    type: "inbound_message_received",
    payload: { text: args.text.slice(0, 500), created_lead: createdNow, origin: messageOrigin } as never,
  });

  // Automatic reply / menu / out-of-office — do not respond, do not qualify.
  if (isAutomatic) {
    await supabaseAdmin.from("activity_events").insert({
      lead_id: leadId, organization_id: args.orgId,
      type: "automatic_message_detected",
      payload: { origin: messageOrigin } as never,
    });
    const { data: recent } = await supabaseAdmin
      .from("messages").select("body, created_at")
      .eq("lead_id", leadId).eq("channel", "whatsapp").eq("direction", "inbound")
      .order("created_at", { ascending: false }).limit(6);
    const loop = detectBotLoop((recent ?? []) as Array<{ body: string | null; created_at: string }>);
    if (loop.suspected) {
      await supabaseAdmin.from("leads").update({
        ai_paused: true, ai_paused_at: new Date().toISOString(),
        cadence_paused: true, needs_human: true,
        human_reason: "suspected_bot",
        human_flagged_at: new Date().toISOString(),
        handoff_reason: loop.reason ?? "suspected_bot",
        handoff_at: new Date().toISOString(),
      } as never).eq("id", leadId);
      await supabaseAdmin.from("activity_events").insert({
        lead_id: leadId, organization_id: args.orgId,
        type: "suspected_bot_detected",
        payload: { reason: loop.reason, auto_count: loop.autoCount } as never,
      });
    }
    return true;
  }

  // Interaction cap — hand off before it becomes noise.
  const { data: leadRow } = await supabaseAdmin
    .from("leads")
    .select("inbound_interactions_count, is_customer, status, ai_paused")
    .eq("id", leadId)
    .maybeSingle();
  const count = (leadRow?.inbound_interactions_count ?? 0) + 1;
  await supabaseAdmin
    .from("leads")
    .update({
      inbound_interactions_count: count,
      last_inbound_at: new Date().toISOString(),
      status: leadRow?.status === "inbound_new"
        ? ("inbound_in_progress" as never)
        : (leadRow?.status as never),
    } as never)
    .eq("id", leadId);

  if (count >= (settings.max_inbound_interactions ?? 25)) {
    await handleInboundHandoff(supabaseAdmin, {
      orgId: args.orgId,
      leadId,
      phone: args.phone,
      reason: "max_interactions_reached",
      settings,
    });
    return true;
  }

  if (leadRow?.ai_paused) {
    // Human already assumed; do not auto-reply.
    return true;
  }

  // Fast keyword-based handoff triggers (before the LLM classifier).
  // Covers: explicit request for a human/seller/specialist, and clear signs of
  // frustration/irritation. Standard handoff message is sent from
  // handleInboundHandoff.
  const lower = args.text.toLowerCase();
  const HUMAN_KEYWORDS =
    /(falar\s+com\s+(um\s+)?(vendedor|especialista|atendente|humano|pessoa|consultor|gerente))|quero\s+(um\s+)?(vendedor|especialista|humano|atendente)|me\s+passa\s+(pra|para)\s+(um\s+)?(vendedor|humano|atendente|especialista)/;
  const ANGER_KEYWORDS =
    /(t[oôòó]\s+irritad|estou\s+irritad|absurdo|revoltad|p[eé]ssim[oa]\s+atendimento|cancelar\s+tudo|processar|reclama[çc][ãa]o|reclamar|xingar|nunca\s+mais|robô\s+idiota|bot\s+idiota)/;
  if (HUMAN_KEYWORDS.test(lower)) {
    await handleInboundHandoff(supabaseAdmin, {
      orgId: args.orgId, leadId, phone: args.phone,
      reason: "human_requested", settings,
    });
    return true;
  }
  if (ANGER_KEYWORDS.test(lower)) {
    await handleInboundHandoff(supabaseAdmin, {
      orgId: args.orgId, leadId, phone: args.phone,
      reason: "lead_upset", settings,
    });
    return true;
  }

  const intent = await classifyInboundIntent(args.text);
  await supabaseAdmin.from("activity_events").insert({
    lead_id: leadId,
    organization_id: args.orgId,
    type: "inbound_intent_detected",
    payload: { intent } as never,
  });

  // Explicit handoff intents.
  const handoffReasons: Partial<Record<InboundIntent, string>> = {
    humano: "human_requested",
    financeiro: "finance_requested",
    fornecedor: "supplier_contact",
    cliente_existente: "existing_customer",
  };
  if (handoffReasons[intent]) {
    await handleInboundHandoff(supabaseAdmin, {
      orgId: args.orgId,
      leadId,
      phone: args.phone,
      reason: handoffReasons[intent]!,
      settings,
    });
    return true;
  }

  // Support: only real customers get support handoff; others get a commercial nudge.
  if (intent === "suporte") {
    if (leadRow?.is_customer) {
      await handleInboundHandoff(supabaseAdmin, {
        orgId: args.orgId,
        leadId,
        phone: args.phone,
        reason: "support_requested",
        settings,
      });
      return true;
    }
    // fall through to AI reply explaining the situation
  }

  if (intent === "spam") {
    // Do not reply, but keep the record.
    return true;
  }

  // Scheduling attempt — only when the lead EXPLICITLY asks for a meeting.
  // Mentioning a time by itself is no longer enough.
  const TIME_HINT = /(\d{1,2}\s*[:h]\s*\d{0,2}|amanh[ãa]|hoje|depois\s+de\s+amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|de\s+manh[ãa]|[àa]\s+tarde|[àa]\s+noite|meio[\s-]?dia|\d{1,2}\/\d{1,2})/i;
  const wantsMeeting = hasExplicitMeetingIntent(args.text);
  if (intent === "comercial" && wantsMeeting && TIME_HINT.test(args.text)) {
    try {
      const { findBestAvailableSeller, bookSlotForLead } = await import("@/lib/scheduling-book.server");
      const seller = await findBestAvailableSeller(supabaseAdmin, { orgId: args.orgId });
      if (seller.ok) {
        const booked = await bookSlotForLead(supabaseAdmin, {
          orgId: args.orgId,
          leadId,
          startIso: seller.slotStart,
          endIso: seller.slotEnd,
          forcedOwnerId: seller.sellerUserId,
          createdVia: "whatsapp_inbound",
        });
        if (booked.ok) {
          const when = new Date(booked.startIso).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "full",
            timeStyle: "short",
          });
          const confirm =
            `Perfeito! Reunião confirmada para ${when} (horário de Brasília).` +
            (booked.meetingUrl ? ` Link: ${booked.meetingUrl}` : "");
          await sendReply(supabaseAdmin, {
            orgId: args.orgId, leadId, phone: args.phone, body: confirm, settings, origin: "inbound",
          });
          return true;
        }
        // Booking failed → hand off to a human instead of silently retrying.
        await handleInboundHandoff(supabaseAdmin, {
          orgId: args.orgId, leadId, phone: args.phone,
          reason: "booking_failed", settings,
        });
        return true;
      } else if (seller.reason === "no_connections") {
        // No seller with connected calendar → handoff instead of scheduling.
        await handleInboundHandoff(supabaseAdmin, {
          orgId: args.orgId, leadId, phone: args.phone,
          reason: "no_seller_with_calendar", settings,
        });
        return true;
      }
    } catch {
      // Scheduling threw → hand off; do not leave the lead without response.
      await handleInboundHandoff(supabaseAdmin, {
        orgId: args.orgId, leadId, phone: args.phone,
        reason: "booking_failed", settings,
      });
      return true;
    }
  }

  // Business-hours check: send after-hours notice, then still reply with the AI.
  const inHours = isWithinBusinessHours(settings);
  if (!inHours && settings.inbound_after_hours_message) {
    await sendReply(supabaseAdmin, {
      orgId: args.orgId,
      leadId,
      phone: args.phone,
      body: settings.inbound_after_hours_message,
      settings,
      origin: "inbound",
    });
  }

  const reply = await generateInboundReply(supabaseAdmin, {
    orgId: args.orgId,
    leadId,
    message: args.text,
    settings,
    intent,
  });
  // Repetition guard — do not send a near-duplicate reply.
  const { data: recentOut } = await supabaseAdmin
    .from("messages").select("body")
    .eq("lead_id", leadId).eq("channel", "whatsapp").eq("direction", "outbound")
    .order("created_at", { ascending: false }).limit(3);
  const prevBodies = ((recentOut ?? []) as Array<{ body: string | null }>).map((m) => m.body ?? "");
  if (isRepetitiveOutbound(reply, prevBodies)) {
    await supabaseAdmin.from("activity_events").insert({
      lead_id: leadId, organization_id: args.orgId,
      type: "agent_repetition_blocked",
      payload: { candidate: reply.slice(0, 300) } as never,
    });
    return true;
  }
  await sendReply(supabaseAdmin, {
    orgId: args.orgId,
    leadId,
    phone: args.phone,
    body: reply,
    settings,
    origin: "inbound",
  });
  await supabaseAdmin.from("activity_events").insert({
    lead_id: leadId,
    organization_id: args.orgId,
    type: "inbound_agent_replied",
    payload: { intent } as never,
  });
  return true;
}
