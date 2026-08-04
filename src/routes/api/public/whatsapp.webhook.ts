import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { createOpenAiCompatibleProvider, getAiApiKey } from "@/lib/ai-gateway";
import { INTENT_SYSTEM, replySystemPrompt, replyUserPrompt } from "@/lib/prompts";
import { detectOptOut } from "@/lib/sending-guards.server";
import { handleInboundMessage } from "@/lib/inbound-router.server";
import {
  classifyMessageOrigin,
  isAutomaticOrigin,
  detectBotLoop,
  hasExplicitMeetingIntent,
  isRepetitiveOutbound,
  classifyDisinterestKind,
} from "@/lib/message-classification.server";

const INTENTS = ["interessado", "pediu_info", "objecao", "desinteresse", "agendar", "outro"] as const;
const BRAZIL_TIMEZONE = "America/Sao_Paulo";

/** Defensive JSON extraction: strips ```json fences, finds first {...} block. */
function parseJsonLoose<T = any>(text: string): T | null {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (m) s = m[0];
  try { return JSON.parse(s) as T; } catch { return null; }
}

/** Normalize text for deterministic matching: lowercase, strip punctuation/accents. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

const AFFIRM_WORDS = ["ok","okay","sim","claro","perfeito","fechado","fechou","bora","confirmo","confirmado","combinado","pode ser","pode","beleza","blz","show","top","isso","positivo","afirmativo"];
const ORDINAL_WORDS: Record<string, number> = {
  "primeiro": 1, "primeira": 1, "1o": 1, "1a": 1,
  "segundo": 2, "segunda": 2, "2o": 2, "2a": 2,
  "terceiro": 3, "terceira": 3, "3o": 3, "3a": 3,
};

/** Returns 1-based slot index if the lead clearly picked one (deterministic, no LLM). */
function deterministicSlotPick(text: string, slotCount: number): number | null {
  const n = normalize(text);
  if (!n) return null;
  // bare number
  const bare = n.match(/^(?:opcao|opção|n[uú]mero|numero|nro|nr|item|alternativa)?\s*(\d{1,2})$/);
  if (bare) { const i = Number(bare[1]); if (i >= 1 && i <= slotCount) return i; }
  // "a 1", "opcao 1", "quero a 2", "vai ser o 3", "o numero 1"
  const inner = n.match(/(?:opcao|opção|numero|nro|nr|item|alternativa|primeira|segunda|terceira|primeiro|segundo|terceiro)\s*(\d{1,2})?/);
  if (inner) {
    if (inner[1]) {
      const i = Number(inner[1]); if (i >= 1 && i <= slotCount) return i;
    } else {
      for (const [w, i] of Object.entries(ORDINAL_WORDS)) {
        if (n.includes(w) && i <= slotCount) return i;
      }
    }
  }
  for (const [w, i] of Object.entries(ORDINAL_WORDS)) {
    if (n.includes(w) && i <= slotCount) return i;
  }
  // single slot proposed + affirmative reply
  if (slotCount === 1 && AFFIRM_WORDS.some(w => n === w || n.startsWith(w + " ") || n.endsWith(" " + w) || n.includes(" " + w + " "))) {
    return 1;
  }
  return null;
}

function wantsCancelMeeting(text: string) {
  const n = normalize(text);
  return /(cancelar|cancele|desmarcar|desmarque|excluir|exclua|remover|apagar)\b/.test(n) && /(reuniao|agenda|evento|horario|call|compromisso)/.test(n);
}

function wantsRescheduleMeeting(text: string) {
  const n = normalize(text);
  return /(reagendar|remarcar|alterar|mudar|trocar)\b/.test(n) && /(reuniao|agenda|evento|horario|call|compromisso)/.test(n);
}

function formatBrazilDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: BRAZIL_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractEvolutionPayload(body: any): { from: string; text: string; messageId?: string } | null {
  // Evolution API v2: messages.upsert event
  const d = body?.data ?? body;
  const remoteJid: string | undefined = d?.key?.remoteJid ?? d?.remoteJid;
  const fromMe: boolean | undefined = d?.key?.fromMe;
  if (!remoteJid || fromMe) return null;
  const text: string | undefined =
    d?.message?.conversation ??
    d?.message?.extendedTextMessage?.text ??
    d?.text ??
    d?.body;
  if (!text) return null;
  const from = remoteJid.split("@")[0];
  const messageId: string | undefined = d?.key?.id;
  return { from, text, messageId };
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token =
          request.headers.get("x-webhook-token") ??
          url.searchParams.get("token") ??
          "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!token) return new Response("unauthorized", { status: 401 });
        const { data: settings, error: se } = await supabaseAdmin
          .from("app_settings")
          .select("whatsapp_webhook_token, booking_link, organization_id")
          .eq("whatsapp_webhook_token", token)
          .maybeSingle();
        if (se || !settings?.whatsapp_webhook_token) {
          return new Response("unauthorized", { status: 401 });
        }
        const orgId = settings.organization_id;

        const body = await request.json().catch(() => null);
        if (!body) return new Response("bad request", { status: 400 });
        const ev = extractEvolutionPayload(body);
        if (!ev) return new Response("ignored", { status: 200 });

        // Classify inbound origin (human vs automatic reply / menu / chatbot).
        // This runs BEFORE any LLM call and drives whether we auto-reply.
        const messageOrigin = classifyMessageOrigin(ev.text);
        const isAutomatic = isAutomaticOrigin(messageOrigin);

        // Find lead by phone digits
        const digits = ev.from.replace(/\D/g, "");
        const tail = digits.slice(-11);
        const { data: leads } = await supabaseAdmin.rpc("find_lead_by_phone", {
          _org_id: orgId,
          _tail: tail,
        } as never);
        const lead = (leads as Array<{
          id: string; whatsapp: string | null; telefone: string | null;
          status: string; ai_paused: boolean; opt_out: boolean; agent_id: string | null;
          razao_social: string | null; nome_fantasia: string | null;
          segmento: string | null; cidade: string | null; estado: string | null; notes: string | null;
        }> | null)?.[0];
        if (!lead) {
          // No lead found — try inbound router (may auto-create + reply).
          const handled = await handleInboundMessage(supabaseAdmin, {
            orgId,
            phone: ev.from,
            text: ev.text,
            externalId: ev.messageId ?? null,
            leadId: null,
            rawPayload: body,
          }).catch(() => false);
          return new Response(handled ? "inbound" : "lead not found", { status: 200 });
        }

        // If the message is automatic, persist it, log the detection and do NOT
        // reply. It must not change status, intent, or trigger scheduling.
        if (isAutomatic) {
          if (ev.messageId) {
            const { data: existingDup } = await supabaseAdmin
              .from("messages").select("id").eq("external_id", ev.messageId).maybeSingle();
            if (existingDup) return new Response("dup", { status: 200 });
          }
          await supabaseAdmin.from("messages").insert({
            lead_id: lead.id, organization_id: orgId, channel: "whatsapp",
            direction: "inbound", body: ev.text, status: "received",
            external_id: ev.messageId ?? null, intent: null,
            conversation_origin: messageOrigin,
            raw_response: body as never,
          } as never);
          await supabaseAdmin.from("activity_events").insert({
            lead_id: lead.id, organization_id: orgId,
            type: "automatic_message_detected",
            payload: { origin: messageOrigin, text: ev.text.slice(0, 300) } as never,
          });
          // Bot-loop protection: if the last few inbound msgs also look automatic,
          // pause AI and flag for human review. Do not send anything back.
          const { data: recent } = await supabaseAdmin
            .from("messages")
            .select("body, created_at")
            .eq("lead_id", lead.id).eq("channel", "whatsapp").eq("direction", "inbound")
            .order("created_at", { ascending: false }).limit(6);
          const loop = detectBotLoop((recent ?? []) as Array<{ body: string | null; created_at: string }>);
          if (loop.suspected && !lead.ai_paused) {
            await supabaseAdmin.from("leads").update({
              ai_paused: true, ai_paused_at: new Date().toISOString(),
              cadence_paused: true, needs_human: true,
              human_reason: "suspected_bot",
              human_flagged_at: new Date().toISOString(),
              handoff_reason: loop.reason ?? "suspected_bot",
              handoff_at: new Date().toISOString(),
            } as never).eq("id", lead.id);
            await supabaseAdmin.from("activity_events").insert({
              lead_id: lead.id, organization_id: orgId,
              type: "suspected_bot_detected",
              payload: { reason: loop.reason, auto_count: loop.autoCount } as never,
            });
          }
          return Response.json({ ok: true, skipped: "automatic_message" });
        }

        // If the lead exists but has NO active cadence, treat as inbound conversation.
        {
          const { data: leadExt } = await supabaseAdmin
            .from("leads")
            .select("active_cadence_id, cadence_paused")
            .eq("id", lead.id)
            .maybeSingle();
          const hasActiveCadence = Boolean(
            leadExt && (leadExt as { active_cadence_id?: string | null }).active_cadence_id
              && !(leadExt as { cadence_paused?: boolean }).cadence_paused,
          );
          if (!hasActiveCadence) {
            const handled = await handleInboundMessage(supabaseAdmin, {
              orgId,
              phone: ev.from,
              text: ev.text,
              externalId: ev.messageId ?? null,
              leadId: lead.id,
              rawPayload: body,
            }).catch(() => false);
            if (handled) return new Response("inbound", { status: 200 });
          }
        }

        // Idempotency
        if (ev.messageId) {
          const { data: existing } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("external_id", ev.messageId)
            .maybeSingle();
          if (existing) return new Response("dup", { status: 200 });
        }

        // Classify intent — defensive: generateText + JSON parse, fallback "outro".
        let intent: (typeof INTENTS)[number] | null = null;
        try {
          const key = (() => { try { return getAiApiKey(); } catch { return null; } })();
          if (key) {
            const gateway = createOpenAiCompatibleProvider(key);
            const { text: raw } = await generateText({
              model: gateway("google/gemini-3-flash-preview"),
              system: INTENT_SYSTEM + `\n\nResponda APENAS JSON no formato {"intent":"<um de: ${INTENTS.join("|")}>"}. Use "outro" se incerto.`,
              prompt: `Resposta do lead:\n"""${ev.text}"""`,
            });
            const parsed = parseJsonLoose<{ intent?: string }>(raw);
            const cand = parsed?.intent as (typeof INTENTS)[number] | undefined;
            if (cand && (INTENTS as readonly string[]).includes(cand)) {
              intent = cand;
            } else {
              intent = "outro";
              await supabaseAdmin.from("activity_events").insert({
                lead_id: lead.id, organization_id: orgId,
                type: "intent_classification_failed",
                payload: { error: "unparseable", text: ev.text.slice(0, 200), raw: raw.slice(0, 200) } as never,
              });
            }
          }
        } catch (e) {
          await supabaseAdmin.from("activity_events").insert({
            lead_id: lead.id,
            organization_id: orgId,
            type: "intent_classification_failed",
            payload: { error: (e as Error).message, text: ev.text.slice(0, 200) } as never,
          });
        }

        await supabaseAdmin.from("messages").insert({
          lead_id: lead.id,
          channel: "whatsapp",
          direction: "inbound",
          body: ev.text,
          status: "received",
          external_id: ev.messageId ?? null,
          intent: intent === "outro" ? null : intent,
          raw_response: body as never,
          organization_id: orgId,
        });

        // A/B attribution: find last outbound with variant_key + cadence_day for this lead
        const { data: lastOut } = await supabaseAdmin
          .from("messages")
          .select("variant_key, cadence_day, channel")
          .eq("lead_id", lead.id)
          .eq("direction", "outbound")
          .not("variant_key", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastOut?.variant_key && lastOut.cadence_day != null) {
          const positive = intent === "interessado" || intent === "agendar" || intent === "pediu_info";
          await supabaseAdmin.rpc("bump_variant_reply", {
            _day: lastOut.cadence_day,
            _channel: lastOut.channel,
            _key: lastOut.variant_key,
            _positive: positive,
          } as never);
        }

        const patch: Record<string, unknown> = {
          last_inbound_at: new Date().toISOString(),
        };
        if (intent) patch.intent_last = intent;
        const isOptOut = detectOptOut(ev.text);
        // Only the AI-driven state machine below runs here — it must NEVER
        // discard a lead. Opt-out and disinterest go through handoff instead.
        if (isOptOut) {
          patch.opt_out = true;
          patch.opt_out_at = new Date().toISOString();
          patch.opt_out_reason = "Solicitação via WhatsApp";
          patch.cadence_paused = true;
          patch.ai_paused = true;
          // Lead is preserved. Human decides later whether to reopen.
          patch.status = "needs_human";
          patch.handoff_reason = "opt_out_confirmado";
          patch.handoff_at = new Date().toISOString();
        }
        if (intent === "agendar") {
          patch.status = "qualificado";
        }
        // Reschedule requests must NEVER be treated as objections — they keep the AI active.
        const RESCHEDULE_HINT = /(trocar|remarcar|reagendar|mudar|adiar|antecipar|outro\s+dia|outro\s+hor[áa]rio|outra\s+data|nova\s+data|outro\s+dia\b)/i;
        const looksLikeReschedule = RESCHEDULE_HINT.test(ev.text);
        // Disinterest and objection are now handled below via the standard
        // handoff branch so the lead is preserved and a human can follow up.
        await supabaseAdmin.from("leads").update(patch as never).eq("id", lead.id);

        await supabaseAdmin.from("activity_events").insert({
          lead_id: lead.id,
          type: isOptOut ? "opt_out" : "whatsapp_inbound",
          payload: { text: ev.text.slice(0, 500), intent, opt_out: isOptOut, origin: messageOrigin } as never,
          organization_id: orgId,
        });

        // Block auto-reply if opt-out
        if (isOptOut) {
          await supabaseAdmin.from("activity_events").insert({
            lead_id: lead.id,
            type: "handoff_to_specialist",
            payload: { reason: "opt_out_confirmado", last_message: ev.text.slice(0, 500) } as never,
            organization_id: orgId,
          });
          return Response.json({ ok: true, optOut: true });
        }

        // ---------- DISINTEREST / OBJECTION HANDOFF ----------
        // The AI must never mark a lead as descartado/perdido. "Agora não",
        // "estamos estruturando", "talvez no futuro" and similar signals map
        // to a handoff so a human can follow up when the moment is right.
        const disinterestKind = intent === "desinteresse"
          ? (() => {
              const k = classifyDisinterestKind(ev.text);
              return k === "neither" ? "sem_momento" : k;
            })()
          : null;
        const shouldObjectionHandoff = intent === "objecao" && !looksLikeReschedule;
        if (disinterestKind || shouldObjectionHandoff) {
          const reason = disinterestKind ?? "objecao_sem_avanco";
          const handoffMsg = disinterestKind === "sem_momento"
            ? "Entendi, obrigado por compartilhar. Vou deixar nosso time disponível para acompanhar esse momento e retomamos a conversa quando fizer sentido para vocês."
            : disinterestKind === "recusa_definitiva"
              ? "Perfeito, agradeço o retorno. Vou registrar aqui e um especialista da JCS revisa para não incomodar vocês sem necessidade."
              : "Entendi. Vou encaminhar seu contato para um especialista da JCS continuar a conversa com mais contexto.";
          try {
            const { data: cfg } = await supabaseAdmin
              .from("app_settings")
              .select("whatsapp_instance_url, whatsapp_instance_name, whatsapp_api_key")
              .eq("organization_id", orgId)
              .maybeSingle();
            if (cfg?.whatsapp_instance_url && cfg.whatsapp_instance_name && cfg.whatsapp_api_key) {
              const { sendWhatsAppText } = await import("@/lib/evolution.server");
              const r = await sendWhatsAppText(
                { instanceUrl: cfg.whatsapp_instance_url, instanceName: cfg.whatsapp_instance_name, apiKey: cfg.whatsapp_api_key },
                ev.from,
                handoffMsg,
              );
              await supabaseAdmin.from("messages").insert({
                lead_id: lead.id, channel: "whatsapp", direction: "outbound",
                body: handoffMsg, status: "sent", external_id: r.externalId,
                generated_by_ai: true, organization_id: orgId,
              } as never);
            }
          } catch { /* never break webhook */ }
          await supabaseAdmin.from("leads").update({
            ai_paused: true,
            ai_paused_at: new Date().toISOString(),
            cadence_paused: true,
            status: "needs_human",
            handoff_reason: reason,
            handoff_at: new Date().toISOString(),
          } as never).eq("id", lead.id);
          await supabaseAdmin.from("activity_events").insert({
            lead_id: lead.id,
            type: "handoff_to_specialist",
            payload: { reason, intent, last_message: ev.text.slice(0, 500) } as never,
            organization_id: orgId,
          });
          return Response.json({ ok: true, handoff: reason });
        }

        // ---------- HANDOFF DETECTION (before AI reply) ----------
        // Triggers: explicit request for human, pricing/proposal, anger, or 25-interaction cap.
        const lower = ev.text.toLowerCase();
        const HUMAN_PATTERNS = [
          "human", "atendente", "vendedor", "especialista", "pessoa real",
          "falar com algu", "quero falar com", "consultor",
        ];
        const PRICING_PATTERNS = ["proposta", "or\u00e7amento", "orcamento", "pre\u00e7o detalhado", "valores detalhados"];
        const ANGRY_PATTERNS = ["absurdo", "ridiculo", "rid\u00edculo", "p\u00e9ssimo", "pessimo", "horr\u00edvel", "horrivel", "cancelar tudo", "processar", "reclama\u00e7\u00e3o", "reclamacao"];
        let handoffReason: string | null = null;
        if (HUMAN_PATTERNS.some((p) => lower.includes(p))) handoffReason = "human_requested";
        else if (PRICING_PATTERNS.some((p) => lower.includes(p))) handoffReason = "pricing_requested";
        else if (ANGRY_PATTERNS.some((p) => lower.includes(p))) handoffReason = "angry_lead";
        if (!handoffReason) {
          const { count: aiOutCount } = await supabaseAdmin
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("lead_id", lead.id)
            .eq("direction", "outbound")
            .eq("generated_by_ai", true);
          if ((aiOutCount ?? 0) >= 25) handoffReason = "max_interactions_reached";
        }
        if (handoffReason) {
          const handoffMsg = handoffReason === "max_interactions_reached"
            ? "Para garantir um atendimento mais preciso, vou encaminhar sua conversa para um especialista da JCS continuar com você."
            : "Perfeito, vou encaminhar você agora para um especialista da JCS continuar o atendimento. Ele terá o histórico da nossa conversa para te ajudar melhor.";
          try {
            const { data: cfg } = await supabaseAdmin
              .from("app_settings")
              .select("whatsapp_instance_url, whatsapp_instance_name, whatsapp_api_key")
              .eq("organization_id", orgId)
              .maybeSingle();
            if (cfg?.whatsapp_instance_url && cfg.whatsapp_instance_name && cfg.whatsapp_api_key) {
              const { sendWhatsAppText } = await import("@/lib/evolution.server");
              const r = await sendWhatsAppText(
                { instanceUrl: cfg.whatsapp_instance_url, instanceName: cfg.whatsapp_instance_name, apiKey: cfg.whatsapp_api_key },
                ev.from,
                handoffMsg,
              );
              await supabaseAdmin.from("messages").insert({
                lead_id: lead.id, channel: "whatsapp", direction: "outbound",
                body: handoffMsg, status: "sent", external_id: r.externalId,
                generated_by_ai: true, organization_id: orgId,
              } as never);
            }
          } catch { /* never break webhook */ }
          await supabaseAdmin.from("leads").update({
            ai_paused: true,
            ai_paused_at: new Date().toISOString(),
            cadence_paused: true,
            status: "needs_human",
            handoff_reason: handoffReason,
            handoff_at: new Date().toISOString(),
          } as never).eq("id", lead.id);
          await supabaseAdmin.from("activity_events").insert({
            lead_id: lead.id,
            type: "handoff_to_specialist",
            payload: { reason: handoffReason, last_message: ev.text.slice(0, 500) } as never,
            organization_id: orgId,
          });
          return Response.json({ ok: true, handoff: handoffReason });
        }

        // Auto-reply with the agent (continuous follow-up until human takes over or sale closes)
        const skipReason =
          lead.ai_paused ? "ai_paused"
          : lead.opt_out ? "opt_out"
          : lead.status === "convertido" ? "converted"
          : lead.status === "descartado" ? "discarded"
          : null;
        if (!skipReason) {
          try {
            const { data: cfg } = await supabaseAdmin
              .from("app_settings")
              .select("whatsapp_instance_url, whatsapp_instance_name, whatsapp_api_key, agent_name, agent_personality, agent_product, agent_objections, llm_model")
              .eq("organization_id", orgId)
              .maybeSingle();
            if (cfg?.whatsapp_instance_url && cfg.whatsapp_instance_name && cfg.whatsapp_api_key) {
              // Load agent
              let agent: any = null;
              if (lead.agent_id) {
                const { data: a } = await supabaseAdmin
                  .from("ai_agents")
                  .select("name, personality, campaign_goal, training_notes, product, objections, llm_model")
                  .eq("id", lead.agent_id)
                  .maybeSingle();
                agent = a;
              }
              const agentSettings = {
                agent_name: agent?.name || cfg.agent_name,
                agent_personality:
                  [agent?.personality, agent?.campaign_goal, agent?.training_notes]
                    .filter(Boolean)
                    .join("\n") || cfg.agent_personality,
                agent_product: agent?.product || cfg.agent_product,
                agent_objections: agent?.objections || cfg.agent_objections,
                booking_link: settings.booking_link,
              };

              // History last 12 messages
              const { data: history } = await supabaseAdmin
                .from("messages")
                .select("direction, body, created_at")
                .eq("lead_id", lead.id)
                .eq("channel", "whatsapp")
                .order("created_at", { ascending: false })
                .limit(12);
              const ordered = (history ?? []).slice().reverse().map((m) => ({
                direction: m.direction as "inbound" | "outbound",
                body: m.body,
              }));

              let replyBody = "";
              const key = (() => { try { return getAiApiKey(); } catch { return null; } })();
              // Real-time calendar fetch when the lead wants to schedule.
              // The agent must NEVER invent a time — we hand it the actual free slots.
              let realSlotsText = "";
              let confirmationText = ""; // prepended ONLY after the real event was created
              let directCalendarReply = "";
              let calendarNeedsAlternatives = false;
              const rescheduleRequested = wantsRescheduleMeeting(ev.text);
              const cancelRequested = !rescheduleRequested && wantsCancelMeeting(ev.text);
              // Only trigger scheduling flows when the lead explicitly asks for it.
              // Presence of a time word alone is not enough — the message must
              // either be classified as "agendar" or contain explicit intent.
              const explicitMeeting = hasExplicitMeetingIntent(ev.text);
              const schedulingAllowed =
                rescheduleRequested || intent === "agendar" || explicitMeeting;

              if (cancelRequested) {
                try {
                  const { cancelLatestMeetingForLead } = await import("@/lib/scheduling-book.server");
                  const cancelResult = await cancelLatestMeetingForLead(supabaseAdmin, {
                    orgId,
                    leadId: lead.id,
                    reason: "Lead solicitou cancelamento pelo WhatsApp",
                    actorId: lead.agent_id,
                  });
                  if (cancelResult.ok) {
                    confirmationText = "Reunião cancelada na agenda real.";
                  } else {
                    confirmationText = cancelResult.reason === "not_found"
                      ? "Não encontrei reunião ativa para cancelar na agenda."
                      : "Não consegui alterar a agenda automaticamente agora. Vou acionar um especialista para conferir manualmente.";
                  }
                } catch (e) {
                  await supabaseAdmin.from("activity_events").insert({
                    lead_id: lead.id, organization_id: orgId,
                    type: "calendar_cancel_failed",
                    payload: { error: (e as Error).message, text: ev.text.slice(0, 200) } as never,
                  });
                }
              }

              // ---------- 1) If we recently proposed slots, see if the lead accepted one ----------
              try {
                const since = new Date(Date.now() - 60 * 60_000).toISOString();
                const { data: proposed } = await supabaseAdmin
                  .from("activity_events")
                  .select("id, payload, created_at")
                  .eq("lead_id", lead.id)
                  .eq("type", "slots_proposed")
                  .gte("created_at", since)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                const slotList =
                  (proposed as any)?.payload?.slots as Array<{ start: string; end: string; label: string }> | undefined;
                const proposedPurpose = ((proposed as any)?.payload?.purpose === "reschedule" ? "reschedule" : "book") as "book" | "reschedule";
                if (!cancelRequested && slotList && slotList.length) {
                  let chosenStart: string | undefined;
                  let chosenEnd: string | undefined;
                  let pickMethod: "numeric" | "affirmation" | "llm" | "none" = "none";
                  // (a) Deterministic numeric / affirmative pick — no LLM.
                  const detIdx = deterministicSlotPick(ev.text, slotList.length);
                  if (detIdx) {
                    chosenStart = slotList[detIdx - 1].start;
                    chosenEnd = slotList[detIdx - 1].end;
                    pickMethod = slotList.length === 1 ? "affirmation" : "numeric";
                  } else if (key) {
                    // (b) Fallback: LLM via generateText + JSON parse.
                    const gateway = createOpenAiCompatibleProvider(key);
                    const menu = slotList.map((s, i) => `${i + 1}) ${s.label} (${s.start})`).join("\n");
                    const { text: raw } = await generateText({
                      model: gateway("google/gemini-3-flash-preview"),
                      system:
                        'Você decide se a última resposta do lead aceitou um dos horários propostos. Responda APENAS JSON {"accepted":bool,"index":int?,"proposedIso":string?}. Se aceitou claramente um horário do menu, devolva index (1-based). Se sugeriu OUTRO horário específico, devolva proposedIso ISO-8601. Caso contrário accepted=false.',
                      prompt: `Horários propostos:\n${menu}\n\nResposta do lead:\n"""${ev.text}"""`,
                    });
                    const pick = parseJsonLoose<{ accepted?: boolean; index?: number; proposedIso?: string }>(raw) ?? {};
                    if (pick.accepted) {
                      if (pick.index && slotList[pick.index - 1]) {
                        chosenStart = slotList[pick.index - 1].start;
                        chosenEnd = slotList[pick.index - 1].end;
                        pickMethod = "llm";
                      } else if (pick.proposedIso) {
                        chosenStart = new Date(pick.proposedIso).toISOString();
                        pickMethod = "llm";
                      }
                    }
                  }
                  await supabaseAdmin.from("activity_events").insert({
                    lead_id: lead.id, organization_id: orgId,
                    type: "slot_pick_decision",
                    payload: { method: pickMethod, chosen_start: chosenStart ?? null, text: ev.text.slice(0, 200) } as never,
                  });
                  if (chosenStart) {
                    const { bookSlotForLead, rescheduleLatestMeetingForLead } = await import("@/lib/scheduling-book.server");
                    const result = proposedPurpose === "reschedule"
                      ? await rescheduleLatestMeetingForLead(supabaseAdmin, {
                        orgId,
                        leadId: lead.id,
                        startIso: chosenStart,
                        endIso: chosenEnd,
                        reason: "Lead escolheu novo horário pelo WhatsApp",
                        actorId: lead.agent_id,
                      })
                      : await bookSlotForLead(supabaseAdmin, {
                        orgId,
                        leadId: lead.id,
                        startIso: chosenStart,
                        endIso: chosenEnd,
                        createdVia: "whatsapp_agent",
                        createdByAgentId: lead.agent_id,
                      });
                    if (result.ok) {
                      const when = formatBrazilDateTime(result.startIso);
                      confirmationText = proposedPurpose === "reschedule"
                        ? `Reunião reagendada para ${when}.${result.meetingUrl ? ` Link: ${result.meetingUrl}` : ""}`
                        : `Reunião confirmada para ${when}.${result.meetingUrl ? ` Link: ${result.meetingUrl}` : ""}`;
                    } else {
                      await supabaseAdmin.from("activity_events").insert({
                        organization_id: orgId,
                        lead_id: lead.id,
                        type: "calendar_meeting_failed",
                        payload: { reason: result.reason, message: result.message, attempted_start: chosenStart },
                      } as never);
                      if (result.reason === "conflict") {
                        calendarNeedsAlternatives = true;
                      } else {
                        confirmationText = "Encontrei um problema ao reservar esse horário. Vou acionar um especialista da JCS para confirmar manualmente.";
                      }
                    }
                  }
                }
                } catch (e) {
                  await supabaseAdmin.from("activity_events").insert({
                    lead_id: lead.id, organization_id: orgId,
                    type: "slot_picker_failed",
                    payload: { error: (e as Error).message } as never,
                  });
                }

              // ---------- 1b) Free-form datetime acceptance (no menu was sent yet) ----------
              // Also run when text contains a time-like token, even if intent classification failed.
              const TIME_HINT = /(\d{1,2}\s*[:h]\s*\d{0,2}|amanh[ãa]|hoje|depois\s+de\s+amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|de\s+manh[ãa]|[àa]\s+tarde|[àa]\s+noite|meio[\s-]?dia|\d{1,2}\/\d{1,2})/i;
              const hasTimeHint = TIME_HINT.test(ev.text);
              if (!confirmationText && key && !cancelRequested && schedulingAllowed && hasTimeHint) {
                try {
                  const gateway = createOpenAiCompatibleProvider(key);
                  const nowIso = new Date().toISOString();
                  const { text: raw } = await generateText({
                    model: gateway("google/gemini-3-flash-preview"),
                    system:
                      'Você extrai um horário CONCRETO proposto pelo lead no WhatsApp para uma reunião comercial. Responda APENAS JSON {"hasDatetime":bool,"startIso":string?}. Se o lead propôs um dia+hora específico (ex: "quinta às 15h30", "amanhã 10h", "30/06 14:00"), devolva startIso em ISO-8601 com timezone America/Sao_Paulo (-03:00). Caso contrário hasDatetime=false. Use o "agora" fornecido como referência para resolver "amanhã", "quinta", etc.',
                    prompt: `Agora: ${nowIso}\nMensagem do lead:\n"""${ev.text}"""`,
                  });
                  const object = parseJsonLoose<{ hasDatetime?: boolean; startIso?: string }>(raw) ?? {};
                  if (object.hasDatetime && object.startIso) {
                    const startIso = new Date(object.startIso).toISOString();
                    if (!isNaN(new Date(startIso).getTime()) && new Date(startIso).getTime() > Date.now()) {
                      const { bookSlotForLead, rescheduleLatestMeetingForLead } = await import("@/lib/scheduling-book.server");
                      const result = rescheduleRequested
                        ? await rescheduleLatestMeetingForLead(supabaseAdmin, {
                          orgId, leadId: lead.id, startIso,
                          reason: "Lead pediu reagendamento com horário específico pelo WhatsApp",
                          actorId: lead.agent_id,
                        })
                        : await bookSlotForLead(supabaseAdmin, {
                          orgId, leadId: lead.id, startIso,
                          createdVia: "whatsapp_agent_freeform",
                          createdByAgentId: lead.agent_id,
                        });
                      if (result.ok) {
                        const when = formatBrazilDateTime(result.startIso);
                        confirmationText = rescheduleRequested
                          ? `Reunião reagendada para ${when}.${result.meetingUrl ? ` Link: ${result.meetingUrl}` : ""}`
                          : `Reunião confirmada para ${when}.${result.meetingUrl ? ` Link: ${result.meetingUrl}` : ""}`;
                      } else if (result.reason === "conflict") {
                        // Let propose-slots step below offer real alternatives.
                        calendarNeedsAlternatives = true;
                      } else {
                        await supabaseAdmin.from("activity_events").insert({
                          organization_id: orgId, lead_id: lead.id,
                          type: "calendar_meeting_failed",
                          payload: { reason: result.reason, message: result.message, attempted_start: startIso },
                        } as never);
                        // Fall through to handoff message via standard reply.
                        await supabaseAdmin.from("leads").update({
                          ai_paused: true, ai_paused_at: new Date().toISOString(),
                          cadence_paused: true, status: "needs_human",
                          handoff_reason: "meeting_creation_failed",
                          handoff_at: new Date().toISOString(),
                        } as never).eq("id", lead.id);
                        confirmationText = "Encontrei um problema ao reservar esse horário. Vou acionar um especialista da JCS para confirmar manualmente.";
                      }
                    }
                  }
                } catch (e) {
                  await supabaseAdmin.from("activity_events").insert({
                    lead_id: lead.id, organization_id: orgId,
                    type: "freeform_datetime_failed",
                    payload: { error: (e as Error).message } as never,
                  });
                }
              }

              if (!confirmationText && !cancelRequested && (calendarNeedsAlternatives || schedulingAllowed)) {
                try {
                  const { proposeRealSlotsForLead } = await import("@/lib/scheduling-book.server");
                  const proposed = await proposeRealSlotsForLead(supabaseAdmin, { orgId, leadId: lead.id, maxSlots: 3 });
                  if (proposed.ok && proposed.slots.length) {
                    const labelled = proposed.slots.map((s) => ({
                      start: s.start,
                      end: s.end,
                      label: formatBrazilDateTime(s.start),
                    }));
                    realSlotsText = "Horários REAIS disponíveis na agenda do responsável (ofereça EXATAMENTE estes, numerados, e peça para o lead escolher 1, 2 ou 3):\n" +
                      labelled.map((s, i) => `${i + 1}) ${s.label}`).join("\n");
                    directCalendarReply = `Consultei a agenda real do responsável. Estes são os horários disponíveis:\n\n${labelled.map((s, i) => `${i + 1}) ${s.label}`).join("\n")}\n\nQual opção fica melhor para você?`;
                    await supabaseAdmin.from("activity_events").insert({
                      organization_id: orgId,
                      lead_id: lead.id,
                      type: "slots_proposed",
                      payload: {
                        slots: labelled,
                        purpose: rescheduleRequested ? "reschedule" : "book",
                        timezone: BRAZIL_TIMEZONE,
                        owner_user_id: proposed.ownerId,
                        working_hours: proposed.workingHours,
                        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
                      },
                    } as never);
                  } else if (proposed.ok) {
                    confirmationText = "Consultei a agenda real do responsável e não há horários livres dentro da janela configurada no momento.";
                  } else {
                    await supabaseAdmin.from("activity_events").insert({
                      organization_id: orgId,
                      lead_id: lead.id,
                      type: "calendar_slots_failed",
                      payload: { reason: proposed.reason, message: proposed.message } as never,
                    } as never);
                    confirmationText = proposed.reason === "no_connection"
                      ? "Não encontrei uma agenda conectada para o responsável por este lead. Vou acionar um especialista para configurar ou confirmar manualmente."
                      : "Não consegui consultar a agenda real do responsável agora. Vou acionar um especialista para confirmar manualmente.";
                  }
                } catch { /* never break reply on calendar errors */ }
              }
              const SCHED_GUARD = "REGRAS DE AGENDAMENTO (obrigatórias): NUNCA invente horários. Só ofereça horários listados em 'Horários REAIS'. NUNCA diga 'agendei', 'reservei', 'marquei', 'vou agendar', 'vou verificar agora', 'já volto com a resposta' ou 'confirmado' por conta própria — o sistema só confirma depois de criar o evento na agenda real. Se houver CONFIRMAÇÃO PRONTA logo abaixo, use-a literalmente como início da sua mensagem. Se NÃO houver CONFIRMAÇÃO PRONTA e NÃO houver 'Horários REAIS', diga apenas que ainda não conseguiu consultar a agenda real e que um especialista vai confirmar manualmente — NÃO prometa enviar email, link nem convite. Se houver 'Horários REAIS', peça para o lead escolher 1, 2 ou 3.";
              if (confirmationText) {
                // Calendar confirmations/errors are system truth; do not let the LLM embellish.
                replyBody = confirmationText;
              } else if (directCalendarReply) {
                // Slot options are the exact result of external free/busy; send verbatim.
                replyBody = directCalendarReply;
              } else if (key) {
                const gateway = createOpenAiCompatibleProvider(key);
                const model = gateway(agent?.llm_model || cfg.llm_model || "google/gemini-3-flash-preview");
                const prePrompt =
                  (confirmationText ? `CONFIRMAÇÃO PRONTA (use literalmente, é a verdade vinda do sistema):\n${confirmationText}\n\n` : "") +
                  (realSlotsText ? realSlotsText + "\n\n" : "");
                const { text } = await generateText({
                  model,
                  system: replySystemPrompt(agentSettings) + "\n" + SCHED_GUARD,
                  prompt: prePrompt + replyUserPrompt({ lead, agent: agentSettings, history: ordered, intent }),
                });
                replyBody = text.trim();
                if (replyBody.length > 800) replyBody = replyBody.slice(0, 800);
              } else if (intent === "agendar" && settings.booking_link) {
                replyBody = `Perfeito! Você pode escolher um horário aqui: ${settings.booking_link}`;
              }

              if (replyBody) {
                // Repetition guard — do not send near-duplicate replies.
                const { data: recentOut } = await supabaseAdmin
                  .from("messages")
                  .select("body")
                  .eq("lead_id", lead.id).eq("channel", "whatsapp").eq("direction", "outbound")
                  .order("created_at", { ascending: false }).limit(3);
                const prevBodies = ((recentOut ?? []) as Array<{ body: string | null }>)
                  .map((m) => m.body ?? "");
                if (isRepetitiveOutbound(replyBody, prevBodies)) {
                  await supabaseAdmin.from("activity_events").insert({
                    lead_id: lead.id, organization_id: orgId,
                    type: "agent_repetition_blocked",
                    payload: { candidate: replyBody.slice(0, 300) } as never,
                  });
                  return Response.json({ ok: true, skipped: "repetition" });
                }
                const { sendWhatsAppText } = await import("@/lib/evolution.server");
                const r = await sendWhatsAppText(
                  { instanceUrl: cfg.whatsapp_instance_url, instanceName: cfg.whatsapp_instance_name, apiKey: cfg.whatsapp_api_key },
                  ev.from,
                  replyBody,
                );
                await supabaseAdmin.from("messages").insert({
                  lead_id: lead.id,
                  channel: "whatsapp",
                  direction: "outbound",
                  body: replyBody,
                  status: "sent",
                  external_id: r.externalId,
                  generated_by_ai: true,
                  organization_id: orgId,
                });
                await supabaseAdmin.from("activity_events").insert({
                  lead_id: lead.id,
                  type: "ai_auto_reply",
                  payload: { intent, length: replyBody.length } as never,
                  organization_id: orgId,
                });
              }
            }
          } catch (e) {
            await supabaseAdmin.from("activity_events").insert({
              lead_id: lead.id,
              type: "ai_auto_reply_failed",
              payload: { error: (e as Error).message } as never,
              organization_id: orgId,
            });
          }
        } else {
          await supabaseAdmin.from("activity_events").insert({
            lead_id: lead.id,
            type: "ai_auto_reply_skipped",
            payload: { reason: skipReason } as never,
            organization_id: orgId,
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
