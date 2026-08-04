import { createFileRoute } from "@tanstack/react-router";

// Meeting lifecycle cron (runs every ~15min). Idempotent.
//
// For each active meeting:
//   - 24h before start: send reminder (once).
//   - 2h before start: send reminder (once).
//   - After end_at: flip to `awaiting_outcome` and ask the seller.
//   - 4h+ without seller update: flip to `outcome_overdue` (alert only).
//
// A reminder is NEVER sent for a meeting whose start_at is already in the
// past. Text is generated from the real timestamp, so we never say
// "tomorrow" / "Thursday" based on stale conversation state.
export const Route = createFileRoute("/api/public/cron/meeting-followup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronRequest } = await import("@/lib/cron-guard.server");
        const denied = verifyCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { classifyMeetingLifecycle, buildReminderText } = await import("@/lib/meetings-lifecycle");
        const { resolveLeadMessagingPhone } = await import("@/lib/phone-resolver");
        const now = new Date();
        // Wide window: from 3 days ago (to catch awaiting/overdue) to 3 days ahead (reminders).
        const from = new Date(now.getTime() - 3 * 86400000).toISOString();
        const to = new Date(now.getTime() + 3 * 86400000).toISOString();
        const { data: rows } = await supabaseAdmin
          .from("meetings_v2")
          .select(
            "id, lead_id, owner_user_id, organization_id, provider, title, meeting_url, start_at, end_at, status, timezone, reminder_24h_sent_at, reminder_2h_sent_at, no_show_message_sent_at, outcome_overdue_alerted_at, confirmation_status",
          )
          .gte("start_at", from)
          .lte("start_at", to)
          .in("status", ["scheduled", "reminder_sent", "awaiting_start", "awaiting_outcome"]);

        let sent24 = 0, sent2 = 0, awaiting = 0, overdue = 0, skipped = 0;

        for (const m of (rows ?? [])) {
          const action = classifyMeetingLifecycle(now, m as any);
          if (action.kind === "skip") { skipped++; continue; }

          if (action.kind === "mark_awaiting_outcome") {
            await supabaseAdmin
              .from("meetings_v2")
              .update({ status: "awaiting_outcome" } as never)
              .eq("id", m.id)
              .neq("status", "awaiting_outcome");
            await supabaseAdmin.from("activity_events").insert({
              lead_id: m.lead_id,
              type: "meeting_outcome_request",
              payload: { meeting_id: m.id, owner_user_id: m.owner_user_id, start_at: m.start_at, end_at: m.end_at },
              organization_id: m.organization_id,
            } as never);
            awaiting++;
            continue;
          }

          if (action.kind === "mark_outcome_overdue") {
            await supabaseAdmin
              .from("meetings_v2")
              .update({ status: "outcome_overdue", outcome_overdue_alerted_at: now.toISOString() } as never)
              .eq("id", m.id);
            await supabaseAdmin.from("activity_events").insert({
              lead_id: m.lead_id,
              type: "meeting_outcome_overdue",
              payload: { meeting_id: m.id, owner_user_id: m.owner_user_id, end_at: m.end_at },
              organization_id: m.organization_id,
            } as never);
            overdue++;
            continue;
          }

          // Reminder actions — send WhatsApp when we have a valid phone.
          if (action.kind === "send_reminder_24h" || action.kind === "send_reminder_2h") {
            const { data: lead } = await supabaseAdmin
              .from("leads")
              .select("id, whatsapp, telefone, nome_fantasia, razao_social, opt_out, ai_paused, cadence_paused")
              .eq("id", m.lead_id as any)
              .maybeSingle();
            if (!lead) { skipped++; continue; }
            if (lead.opt_out) { skipped++; continue; }
            const phone = resolveLeadMessagingPhone({ whatsapp: lead.whatsapp, phone: lead.telefone });
            if (!phone.isValid) { skipped++; continue; }

            const { data: settings } = await supabaseAdmin
              .from("app_settings")
              .select("whatsapp_instance_url, whatsapp_instance_name, whatsapp_api_key")
              .eq("organization_id", m.organization_id)
              .maybeSingle();
            if (!settings?.whatsapp_instance_url) { skipped++; continue; }

            const body = buildReminderText({
              now,
              startAt: new Date(m.start_at),
              leadName: (lead.nome_fantasia || lead.razao_social) as string | null,
              meetingUrl: m.meeting_url,
              timezone: m.timezone,
              kind: action.kind === "send_reminder_24h" ? "24h" : "2h",
            });

            try {
              const { sendWhatsAppText } = await import("@/lib/evolution.server");
              await sendWhatsAppText(
                { instanceUrl: settings.whatsapp_instance_url, instanceName: settings.whatsapp_instance_name!, apiKey: settings.whatsapp_api_key! },
                phone.normalizedPhone!,
                body,
              );
              const patch: Record<string, unknown> = { status: "reminder_sent" };
              if (action.kind === "send_reminder_24h") { patch.reminder_24h_sent_at = now.toISOString(); sent24++; }
              else { patch.reminder_2h_sent_at = now.toISOString(); sent2++; }
              await supabaseAdmin.from("meetings_v2").update(patch as never).eq("id", m.id);
              await supabaseAdmin.from("activity_events").insert({
                lead_id: m.lead_id,
                type: action.kind === "send_reminder_24h" ? "meeting_reminder_24h" : "meeting_reminder_2h",
                payload: { meeting_id: m.id, start_at: m.start_at },
                organization_id: m.organization_id,
              } as never);
            } catch (e) {
              await supabaseAdmin.from("scheduling_logs").insert({
                organization_id: m.organization_id,
                lead_id: m.lead_id,
                user_id: m.owner_user_id,
                action: "reminder_error",
                provider: m.provider,
                error: (e as Error).message,
              } as never);
              skipped++;
            }
          }
        }

        return Response.json({ ok: true, sent24, sent2, awaiting, overdue, skipped, scanned: rows?.length ?? 0 });
      },
    },
  },
});