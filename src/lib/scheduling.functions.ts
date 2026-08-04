import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Resolve which user's calendar should be used for a lead.
 * Fallback chain: lead.owner_id → agent.default_calendar_user_id →
 * app_settings.default_calendar_fallback_user_id → caller.
 * Single point of change for future round-robin / distribution.
 */
async function resolveMeetingOwner(
  supabaseAdmin: any,
  leadId: string,
  orgId: string,
  callerId: string,
): Promise<{ ownerId: string; conn: any } | null> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("owner_id, agent_id, organization_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.organization_id !== orgId) return null;
  const candidates: string[] = [];
  if (lead.owner_id) candidates.push(lead.owner_id);
  if (lead.agent_id) {
    const { data: ag } = await supabaseAdmin
      .from("ai_agents")
      .select("default_calendar_user_id")
      .eq("id", lead.agent_id)
      .maybeSingle();
    if (ag?.default_calendar_user_id) candidates.push(ag.default_calendar_user_id);
  }
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("default_calendar_fallback_user_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (settings?.default_calendar_fallback_user_id) candidates.push(settings.default_calendar_fallback_user_id);
  candidates.push(callerId);

  for (const cid of candidates) {
    const c = await getValidConnectionFor(supabaseAdmin, cid);
    if (c) return { ownerId: cid, conn: c };
  }
  return null;
}

async function getValidConnectionFor(supabaseAdmin: any, userId: string) {
  const { data: conn } = await supabaseAdmin
    .from("calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn) return null;
  const expSoon = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 60000;
  if (expSoon && conn.refresh_token) {
    try {
      const { refreshGoogleToken, refreshMicrosoftToken } = await import("@/lib/calendar.server");
      let tok;
      if (conn.provider === "google") {
        const cid = process.env.GOOGLE_OAUTH_CLIENT_ID!;
        const cs = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
        tok = await refreshGoogleToken({ refreshToken: conn.refresh_token, clientId: cid, clientSecret: cs });
      } else {
        const cid = process.env.MS_OAUTH_CLIENT_ID!;
        const cs = process.env.MS_OAUTH_CLIENT_SECRET!;
        tok = await refreshMicrosoftToken({
          refreshToken: conn.refresh_token,
          clientId: cid,
          clientSecret: cs,
          tenant: process.env.MS_OAUTH_TENANT ?? "common",
        });
      }
      const expires_at = new Date(Date.now() + tok.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("calendar_connections")
        .update({ access_token: tok.access_token, refresh_token: tok.refresh_token ?? conn.refresh_token, expires_at, needs_reauth: false } as never)
        .eq("id", conn.id);
      conn.access_token = tok.access_token;
      conn.expires_at = expires_at;
    } catch (e) {
      await supabaseAdmin.from("calendar_connections").update({ needs_reauth: true } as never).eq("id", conn.id);
      return null;
    }
  }
  return conn;
}

// ---------------- Propose Slots ----------------
export const proposeSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string; durationMin?: number }) =>
    z.object({ leadId: z.string().uuid(), durationMin: z.number().int().min(15).max(240).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { proposeRealSlotsForLead } = await import("@/lib/scheduling-book.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem empresa.");
    const result = await proposeRealSlotsForLead(supabaseAdmin, {
      orgId,
      leadId: data.leadId,
      callerId: context.userId,
      durationMin: data.durationMin,
    });
    if (!result.ok) throw new Error(result.message);
    return result;
  });

// ---------------- Book Slot ----------------
export const bookSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string; startIso: string; endIso?: string; title?: string; notes?: string }) =>
    z.object({
      leadId: z.string().uuid(),
      startIso: z.string(),
      endIso: z.string().optional(),
      title: z.string().optional(),
      notes: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { bookSlotForLead } = await import("@/lib/scheduling-book.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem empresa.");
    return await bookSlotForLead(supabaseAdmin, {
      orgId,
      leadId: data.leadId,
      startIso: data.startIso,
      endIso: data.endIso,
      title: data.title,
      notes: data.notes,
      callerId: context.userId,
      createdVia: "manual",
    });
  });

// ---------------- Cancel ----------------
export const cancelMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { meetingId: string; reason?: string }) =>
    z.object({ meetingId: z.string().uuid(), reason: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { googleDeleteEvent, microsoftDeleteEvent } = await import("@/lib/calendar.server");
    const { logSchedulingEvent } = await import("@/lib/scheduling.server");
    const { data: m } = await supabaseAdmin
      .from("meetings_v2")
      .select("*")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (!m) throw new Error("Reunião não encontrada.");
    const conn = await getValidConnectionFor(supabaseAdmin, m.owner_user_id);
    if (conn && m.external_event_id) {
      try {
        if (conn.provider === "google") {
          await googleDeleteEvent({ accessToken: conn.access_token, eventId: m.external_event_id });
        } else {
          await microsoftDeleteEvent({ accessToken: conn.access_token, eventId: m.external_event_id });
        }
      } catch (e) {
        await logSchedulingEvent(supabaseAdmin, { organization_id: m.organization_id, lead_id: m.lead_id, user_id: m.owner_user_id, action: "error", provider: m.provider, error: (e as Error).message });
      }
    }
    await supabaseAdmin.from("meetings_v2").update({ status: "cancelled", last_synced_at: new Date().toISOString() } as never).eq("id", m.id);
    if (m.external_event_id) {
      await supabaseAdmin.from("meetings").update({ status: "cancelled" } as never).eq("provider_event_id", m.external_event_id);
    }
    await supabaseAdmin.from("activity_events").insert({ lead_id: m.lead_id, type: "meeting_cancelled", payload: { reason: data.reason } } as never);
    await logSchedulingEvent(supabaseAdmin, { organization_id: m.organization_id, lead_id: m.lead_id, user_id: context.userId, action: "cancel", provider: m.provider, payload: { reason: data.reason } });
    return { ok: true };
  });

// ---------------- Reschedule (updates the real external event) ----------------
export const rescheduleMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { meetingId: string; startIso: string; endIso?: string }) =>
    z.object({ meetingId: z.string().uuid(), startIso: z.string(), endIso: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem empresa.");
    const { data: m } = await supabaseAdmin.from("meetings_v2").select("id, organization_id").eq("id", data.meetingId).maybeSingle();
    if (!m) throw new Error("Reunião não encontrada.");
    if (m.organization_id !== orgId) throw new Error("Reunião não encontrada.");
    const { rescheduleLatestMeetingForLead } = await import("@/lib/scheduling-book.server");
    const result = await rescheduleLatestMeetingForLead(supabaseAdmin, {
      orgId,
      meetingId: data.meetingId,
      startIso: data.startIso,
      endIso: data.endIso,
      reason: "manual_reschedule",
      actorId: context.userId,
    });
    if (!result.ok) throw new Error(result.message);
    return result;
  });

// ---------------- List meetings ----------------
export const listLeadMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meetings_v2")
      .select("id, provider, title, start_at, end_at, status, meeting_url, attendees, owner_user_id, happened")
      .eq("lead_id", data.leadId)
      .order("start_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { fromIso: string; toIso: string }) =>
    z.object({ fromIso: z.string(), toIso: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meetings_v2")
      .select("id, provider, title, start_at, end_at, status, meeting_url, owner_user_id, lead_id")
      .gte("start_at", data.fromIso)
      .lte("start_at", data.toIso)
      .order("start_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const markMeetingOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { meetingId: string; outcome: "happened" | "no_show" | "rescheduled" | "cancelled"; notes?: string }) =>
    z.object({
      meetingId: z.string().uuid(),
      outcome: z.enum(["happened", "no_show", "rescheduled", "cancelled"]),
      notes: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> =
      data.outcome === "happened"
        ? { status: "completed", happened: true, completed_at: nowIso }
        : data.outcome === "no_show"
          ? { status: "no_show", happened: false }
          : data.outcome === "cancelled"
            ? { status: "cancelled", cancelled_at: nowIso }
            : { status: "rescheduled" };
    patch.outcome_recorded_by = context.userId;
    patch.outcome_recorded_at = nowIso;
    if (data.notes) patch.outcome_notes = data.notes;
    const { data: updated, error } = await context.supabase
      .from("meetings_v2")
      .update(patch as never)
      .eq("id", data.meetingId)
      .select("lead_id, organization_id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Map to Lead qualification status. Only humans reach this fn.
    if (updated?.lead_id) {
      const leadStatus =
        data.outcome === "happened" ? "reuniao_realizada" :
        data.outcome === "no_show" ? "reuniao_nao_realizada" :
        data.outcome === "cancelled" ? "reuniao_cancelada" :
        "reuniao_remarcada";
      await context.supabase
        .from("leads")
        .update({ status: leadStatus } as never)
        .eq("id", updated.lead_id);
    }
    return { ok: true };
  });

// Client confirmed / requested reschedule via seller UI.
export const setMeetingConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { meetingId: string; confirmation: "confirmed" | "reschedule_requested" }) =>
    z.object({ meetingId: z.string().uuid(), confirmation: z.enum(["confirmed", "reschedule_requested"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      confirmation_status: data.confirmation,
      confirmed_at: data.confirmation === "confirmed" ? nowIso : null,
    };
    if (data.confirmation === "reschedule_requested") patch.status = "reschedule_requested";
    const { error } = await context.supabase.from("meetings_v2").update(patch as never).eq("id", data.meetingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dashboardSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { fromIso: string; toIso: string }) =>
    z.object({ fromIso: z.string(), toIso: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("meetings_v2")
      .select("status, happened, start_at, end_at, owner_user_id")
      .gte("start_at", data.fromIso)
      .lte("start_at", data.toIso);
    const list = rows ?? [];
    const scheduled = list.length;
    const happened = list.filter((r: any) => r.status === "completed").length;
    const noShow = list.filter((r: any) => r.status === "no_show").length;
    const cancelled = list.filter((r: any) => r.status === "cancelled").length;
    const totalEnded = happened + noShow;
    const attendanceRate = totalEnded ? Math.round((happened / totalEnded) * 100) : null;
    const busyMin = list
      .filter((r: any) => r.status !== "cancelled")
      .reduce((s: number, r: any) => s + (new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 60000, 0);
    const byOwner = new Map<string, number>();
    list.forEach((r: any) => byOwner.set(r.owner_user_id, (byOwner.get(r.owner_user_id) ?? 0) + 1));
    const topOwner = [...byOwner.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { scheduled, happened, noShow, cancelled, attendanceRate, busyMin, topOwner };
  });