// Server-only helpers shared by the WhatsApp webhook AND the bookSlot server-fn,
// so the AI agent can create REAL calendar events (not just talk about them).

import {
  googleFreeBusy,
  microsoftFreeBusy,
  googleCreateEvent,
  microsoftCreateEvent,
  googleUpdateEvent,
  microsoftUpdateEvent,
  googleDeleteEvent,
  microsoftDeleteEvent,
  refreshGoogleToken,
  refreshMicrosoftToken,
} from "@/lib/calendar.server";
import { applyConnectionSlotPrefs, BRAZIL_TIMEZONE, computeSmartSlots, isWithinSlotPrefs, loadOrgSlotPrefs, logSchedulingEvent } from "@/lib/scheduling.server";

export async function getValidConnectionForUser(supabaseAdmin: any, userId: string) {
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
      let tok;
      if (conn.provider === "google") {
        tok = await refreshGoogleToken({
          refreshToken: conn.refresh_token,
          clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        });
      } else {
        tok = await refreshMicrosoftToken({
          refreshToken: conn.refresh_token,
          clientId: process.env.MS_OAUTH_CLIENT_ID!,
          clientSecret: process.env.MS_OAUTH_CLIENT_SECRET!,
          tenant: process.env.MS_OAUTH_TENANT ?? "common",
        });
      }
      const expires_at = new Date(Date.now() + tok.expires_in * 1000).toISOString();
      await supabaseAdmin
        .from("calendar_connections")
        .update({
          access_token: tok.access_token,
          refresh_token: tok.refresh_token ?? conn.refresh_token,
          expires_at,
          needs_reauth: false,
        } as never)
        .eq("id", conn.id);
      conn.access_token = tok.access_token;
      conn.expires_at = expires_at;
    } catch {
      await supabaseAdmin
        .from("calendar_connections")
        .update({ needs_reauth: true } as never)
        .eq("id", conn.id);
      return null;
    }
  }
  return conn;
}

export async function resolveOwnerWithConnection(
  supabaseAdmin: any,
  leadId: string,
  orgId: string,
  callerId?: string,
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
  const { data: s } = await supabaseAdmin
    .from("app_settings")
    .select("default_calendar_fallback_user_id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (s?.default_calendar_fallback_user_id) candidates.push(s.default_calendar_fallback_user_id);
  if (callerId) candidates.push(callerId);
  for (const cid of candidates) {
    const c = await getValidConnectionForUser(supabaseAdmin, cid);
    if (c) return { ownerId: cid, conn: c };
  }
  return null;
}

/**
 * Pick the best seller in the organization that has a connected calendar,
 * ranked by earliest free slot in the requested window, tie-breaking by
 * fewest scheduled meetings that day. Excludes superadmins by default.
 */
export async function findBestAvailableSeller(
  supabaseAdmin: any,
  args: { orgId: string; durationMin?: number; fromIso?: string; toIso?: string },
): Promise<
  | { ok: true; sellerUserId: string; slotStart: string; slotEnd: string; provider: "google" | "microsoft"; connectionId: string }
  | { ok: false; reason: "no_sellers" | "no_connections" | "no_slots"; message: string }
> {
  const durationMin = args.durationMin ?? 30;
  const fromIso = args.fromIso ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const toIso = args.toIso ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const tz = BRAZIL_TIMEZONE;

  // 1) Users in this org, excluding superadmins.
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("organization_id", args.orgId);
  const userIds = (profiles ?? []).map((p: { id: string }) => p.id);
  if (userIds.length === 0) return { ok: false, reason: "no_sellers", message: "Nenhum vendedor na organização." };

  const eligible: string[] = [];
  for (const uid of userIds) {
    const { data: isSuper } = await supabaseAdmin.rpc("is_superadmin", { _user_id: uid });
    if (!isSuper) eligible.push(uid);
  }
  if (eligible.length === 0) return { ok: false, reason: "no_sellers", message: "Nenhum vendedor elegível." };

  const prefs = await loadOrgSlotPrefs(supabaseAdmin, args.orgId, { durationMin });

  type Candidate = { userId: string; slotStart: string; slotEnd: string; provider: "google" | "microsoft"; connectionId: string; dayCount: number };
  const candidates: Candidate[] = [];

  for (const uid of eligible) {
    const conn = await getValidConnectionForUser(supabaseAdmin, uid);
    if (!conn) continue;
    const userPrefs = applyConnectionSlotPrefs(prefs, conn);
    try {
      const busy = conn.provider === "google"
        ? await googleFreeBusy({ accessToken: conn.access_token, timeMin: fromIso, timeMax: toIso, timezone: tz })
        : await microsoftFreeBusy({ accessToken: conn.access_token, timeMin: fromIso, timeMax: toIso, timezone: tz });
      const slots = computeSmartSlots({ fromIso, busy, prefs: { ...userPrefs, maxSlots: 1 }, timeZone: tz });
      if (slots.length === 0) continue;
      const first = slots[0];
      // Count meetings that day for tie-break.
      const dayStart = new Date(first.start); dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const { count } = await supabaseAdmin
        .from("meetings_v2")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", uid)
        .eq("status", "scheduled")
        .gte("start_at", dayStart.toISOString())
        .lt("start_at", dayEnd.toISOString());
      candidates.push({
        userId: uid,
        slotStart: first.start,
        slotEnd: first.end,
        provider: conn.provider as "google" | "microsoft",
        connectionId: conn.id,
        dayCount: count ?? 0,
      });
    } catch { /* skip on API error */ }
  }

  if (candidates.length === 0) return { ok: false, reason: "no_connections", message: "Nenhum vendedor com agenda disponível." };
  candidates.sort((a, b) => {
    const ta = new Date(a.slotStart).getTime();
    const tb = new Date(b.slotStart).getTime();
    if (ta !== tb) return ta - tb;
    return a.dayCount - b.dayCount;
  });
  const w = candidates[0];
  return { ok: true, sellerUserId: w.userId, slotStart: w.slotStart, slotEnd: w.slotEnd, provider: w.provider, connectionId: w.connectionId };
}

export type BookResult =
  | { ok: true; meetingId: string; eventId: string; meetingUrl?: string; startIso: string; endIso: string; provider: "google" | "microsoft"; ownerId: string }
  | { ok: false; reason: "no_connection" | "conflict" | "api_error" | "create_failed" | "db_error" | "lead_not_found"; message: string };

export type RescheduleResult =
  | { ok: true; meetingId: string; eventId: string; meetingUrl?: string; startIso: string; endIso: string; provider: "google" | "microsoft"; ownerId: string }
  | { ok: false; reason: "not_found" | "no_connection" | "conflict" | "api_error" | "db_error"; message: string };

export type ProposeSlotsResult =
  | { ok: true; ownerId: string; provider: "google" | "microsoft"; timezone: string; slots: { start: string; end: string }[]; durationMin: number; workingHours: { days: number[]; start: string; end: string } }
  | { ok: false; reason: "no_connection" | "api_error"; message: string };

export async function proposeRealSlotsForLead(
  supabaseAdmin: any,
  args: { orgId: string; leadId: string; callerId?: string; durationMin?: number; maxSlots?: number },
): Promise<ProposeSlotsResult> {
  const resolved = await resolveOwnerWithConnection(supabaseAdmin, args.leadId, args.orgId, args.callerId);
  if (!resolved) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId,
      lead_id: args.leadId,
      user_id: args.callerId ?? null,
      action: "error",
      error: "no_calendar_connection",
    });
    return { ok: false, reason: "no_connection", message: "Nenhuma agenda conectada para o responsável deste lead." };
  }

  const basePrefs = await loadOrgSlotPrefs(supabaseAdmin, args.orgId, { durationMin: args.durationMin });
  const prefs = applyConnectionSlotPrefs(basePrefs, resolved.conn);
  const finalPrefs = { ...prefs, maxSlots: args.maxSlots ?? prefs.maxSlots };
  const tz = BRAZIL_TIMEZONE;
  const timeMin = new Date(Date.now() + finalPrefs.minLeadTimeMin * 60000).toISOString();
  const timeMax = new Date(Date.now() + finalPrefs.maxDaysAhead * 86400000).toISOString();
  const t0 = Date.now();
  try {
    const busy = resolved.conn.provider === "google"
      ? await googleFreeBusy({ accessToken: resolved.conn.access_token, timeMin, timeMax, timezone: tz })
      : await microsoftFreeBusy({ accessToken: resolved.conn.access_token, timeMin, timeMax, timezone: tz });
    const slots = computeSmartSlots({ fromIso: timeMin, busy, prefs: finalPrefs, timeZone: tz });
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId,
      lead_id: args.leadId,
      user_id: resolved.ownerId,
      action: "freebusy_query",
      provider: resolved.conn.provider,
      request_ms: Date.now() - t0,
      payload: {
        slot_count: slots.length,
        duration_min: finalPrefs.durationMin,
        timezone: tz,
        working_hours: { days: finalPrefs.workingDays, start: finalPrefs.workingStart, end: finalPrefs.workingEnd },
      },
    });
    return {
      ok: true,
      ownerId: resolved.ownerId,
      provider: resolved.conn.provider as "google" | "microsoft",
      timezone: tz,
      slots,
      durationMin: finalPrefs.durationMin,
      workingHours: { days: finalPrefs.workingDays, start: finalPrefs.workingStart, end: finalPrefs.workingEnd },
    };
  } catch (e) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId,
      lead_id: args.leadId,
      user_id: resolved.ownerId,
      action: "error",
      provider: resolved.conn.provider,
      request_ms: Date.now() - t0,
      error: (e as Error).message,
    });
    return { ok: false, reason: "api_error", message: "Falha ao consultar a agenda do responsável." };
  }
}

export async function cancelLatestMeetingForLead(
  supabaseAdmin: any,
  args: { orgId: string; leadId: string; reason?: string; actorId?: string | null },
) {
  const { data: meeting } = await supabaseAdmin
    .from("meetings_v2")
    .select("*")
    .eq("organization_id", args.orgId)
    .eq("lead_id", args.leadId)
    .eq("status", "scheduled")
    .gte("start_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString())
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!meeting) return { ok: false as const, reason: "not_found" as const, message: "Nenhuma reunião ativa encontrada para este lead." };
  const conn = await getValidConnectionForUser(supabaseAdmin, meeting.owner_user_id);
  if (conn && meeting.external_event_id) {
    try {
      if (conn.provider === "google") {
        await googleDeleteEvent({ accessToken: conn.access_token, eventId: meeting.external_event_id });
      } else {
        await microsoftDeleteEvent({ accessToken: conn.access_token, eventId: meeting.external_event_id });
      }
    } catch (e) {
      await logSchedulingEvent(supabaseAdmin, {
        organization_id: args.orgId,
        lead_id: args.leadId,
        user_id: meeting.owner_user_id,
        action: "error",
        provider: meeting.provider,
        error: (e as Error).message,
      });
      return { ok: false as const, reason: "api_error" as const, message: "Falha ao excluir o evento na agenda real." };
    }
  }
  await supabaseAdmin
    .from("meetings_v2")
    .update({ status: "cancelled", last_synced_at: new Date().toISOString() } as never)
    .eq("id", meeting.id);
  if (meeting.external_event_id) {
    await supabaseAdmin
      .from("meetings")
      .update({ status: "cancelled" } as never)
      .eq("organization_id", args.orgId)
      .eq("provider_event_id", meeting.external_event_id);
  }
  await supabaseAdmin.from("activity_events").insert({
    organization_id: args.orgId,
    lead_id: args.leadId,
    type: "meeting_cancelled",
    payload: { reason: args.reason ?? null, meeting_id: meeting.id, via: args.actorId ? "user_or_agent" : "whatsapp_agent" } as never,
  } as never);
  await logSchedulingEvent(supabaseAdmin, {
    organization_id: args.orgId,
    lead_id: args.leadId,
    user_id: meeting.owner_user_id,
    action: "cancel",
    provider: meeting.provider,
    payload: { reason: args.reason ?? null, meeting_id: meeting.id },
  });
  return { ok: true as const, meetingId: meeting.id, startIso: meeting.start_at, ownerId: meeting.owner_user_id };
}

export async function rescheduleLatestMeetingForLead(
  supabaseAdmin: any,
  args: { orgId: string; leadId?: string; meetingId?: string; startIso: string; endIso?: string; reason?: string; actorId?: string | null },
): Promise<RescheduleResult> {
  let meetingQuery = supabaseAdmin
    .from("meetings_v2")
    .select("*")
    .eq("organization_id", args.orgId)
    .eq("status", "scheduled");
  if (args.meetingId) {
    meetingQuery = meetingQuery.eq("id", args.meetingId);
  } else if (args.leadId) {
    meetingQuery = meetingQuery
      .eq("lead_id", args.leadId)
      .gte("start_at", new Date(Date.now() - 2 * 60 * 60_000).toISOString())
      .order("start_at", { ascending: true })
      .limit(1);
  } else {
    return { ok: false, reason: "not_found", message: "Informe a reunião ou o lead para reagendar." };
  }
  const { data: meeting } = await meetingQuery.maybeSingle();
  if (!meeting) return { ok: false, reason: "not_found", message: "Nenhuma reunião ativa encontrada para reagendar." };

  const conn = await getValidConnectionForUser(supabaseAdmin, meeting.owner_user_id);
  if (!conn) return { ok: false, reason: "no_connection", message: "Agenda do responsável não está conectada." };

  const prefs = applyConnectionSlotPrefs(await loadOrgSlotPrefs(supabaseAdmin, args.orgId), conn);
  const startIso = new Date(args.startIso).toISOString();
  const endIso = args.endIso
    ? new Date(args.endIso).toISOString()
    : new Date(new Date(startIso).getTime() + prefs.durationMin * 60000).toISOString();
  const tz = BRAZIL_TIMEZONE;
  if (!isWithinSlotPrefs(startIso, endIso, prefs, tz)) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId, lead_id: meeting.lead_id, user_id: meeting.owner_user_id,
      action: "error", provider: conn.provider, error: "reschedule_outside_working_hours",
      payload: { startIso, endIso, timezone: tz, working_hours: { days: prefs.workingDays, start: prefs.workingStart, end: prefs.workingEnd } },
    });
    return { ok: false, reason: "conflict", message: "Horário fora da janela configurada da agenda." };
  }

  try {
    const busy = conn.provider === "google"
      ? await googleFreeBusy({ accessToken: conn.access_token, timeMin: startIso, timeMax: endIso, timezone: tz })
      : await microsoftFreeBusy({ accessToken: conn.access_token, timeMin: startIso, timeMax: endIso, timezone: tz });
    const conflict = busy.some((b) => {
      const overlaps = new Date(b.start) < new Date(endIso) && new Date(b.end) > new Date(startIso);
      const isCurrent = new Date(b.start).getTime() === new Date(meeting.start_at).getTime() && new Date(b.end).getTime() === new Date(meeting.end_at).getTime();
      return overlaps && !isCurrent;
    });
    if (conflict) return { ok: false, reason: "conflict", message: "Horário acabou de ficar indisponível." };
  } catch (e) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId, lead_id: meeting.lead_id, user_id: meeting.owner_user_id,
      action: "error", provider: conn.provider, error: (e as Error).message,
    });
    return { ok: false, reason: "api_error", message: "Falha ao verificar disponibilidade." };
  }

  const { data: dupes } = await supabaseAdmin
    .from("meetings_v2")
    .select("id")
    .eq("owner_user_id", meeting.owner_user_id)
    .eq("status", "scheduled")
    .neq("id", meeting.id)
    .lt("start_at", endIso)
    .gt("end_at", startIso)
    .limit(1);
  if ((dupes ?? []).length > 0) return { ok: false, reason: "conflict", message: "Já existe outra reunião nesse horário." };

  const t0 = Date.now();
  let meetingUrl = meeting.meeting_url as string | undefined;
  try {
    if (meeting.external_event_id) {
      const r = conn.provider === "google"
        ? await googleUpdateEvent({ accessToken: conn.access_token, eventId: meeting.external_event_id, startIso, endIso, timezone: tz, summary: meeting.title, description: meeting.description, attendees: meeting.attendees ?? [] })
        : await microsoftUpdateEvent({ accessToken: conn.access_token, eventId: meeting.external_event_id, startIso, endIso, timezone: tz, subject: meeting.title, body: meeting.description, attendees: meeting.attendees ?? [] });
      meetingUrl = r.meetingUrl || meetingUrl;
    } else {
      return { ok: false, reason: "api_error", message: "Reunião local não possui ID do evento externo." };
    }
  } catch (e) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId, lead_id: meeting.lead_id, user_id: meeting.owner_user_id,
      action: "error", provider: conn.provider, request_ms: Date.now() - t0, error: (e as Error).message,
    });
    return { ok: false, reason: "api_error", message: "Falha ao alterar o evento na agenda real." };
  }

  const { error } = await supabaseAdmin
    .from("meetings_v2")
    .update({ start_at: startIso, end_at: endIso, timezone: tz, meeting_url: meetingUrl, last_synced_at: new Date().toISOString() } as never)
    .eq("id", meeting.id);
  if (error) return { ok: false, reason: "db_error", message: "Evento alterado, mas falhou ao salvar localmente." };
  await supabaseAdmin
    .from("meetings")
    .update({ start_at: startIso, end_at: endIso, meeting_url: meetingUrl } as never)
    .eq("organization_id", args.orgId)
    .eq("provider_event_id", meeting.external_event_id);
  await supabaseAdmin.from("activity_events").insert({
    organization_id: args.orgId,
    lead_id: meeting.lead_id,
    type: "calendar_meeting_rescheduled",
    payload: { meeting_id: meeting.id, old_start_at: meeting.start_at, start_at: startIso, end_at: endIso, meeting_url: meetingUrl, provider: conn.provider, reason: args.reason ?? null, agent_id: args.actorId ?? null } as never,
  } as never);
  await logSchedulingEvent(supabaseAdmin, {
    organization_id: args.orgId, lead_id: meeting.lead_id, user_id: meeting.owner_user_id,
    action: "reschedule", provider: conn.provider, request_ms: Date.now() - t0,
    payload: { event_id: meeting.external_event_id, old_start: meeting.start_at, start: startIso },
  });
  return { ok: true, meetingId: meeting.id, eventId: meeting.external_event_id, meetingUrl, startIso, endIso, provider: conn.provider, ownerId: meeting.owner_user_id };
}

/**
 * Real booking: re-checks freeBusy + checks meetings_v2 overlap, then creates
 * the actual external event, persists meetings_v2 + legacy meetings + activity.
 */
export async function bookSlotForLead(
  supabaseAdmin: any,
  args: {
    orgId: string;
    leadId: string;
    startIso: string;
    endIso?: string;
    title?: string;
    notes?: string;
    callerId?: string;
    createdVia?: string; // "whatsapp_agent" | "manual" | etc.
    createdByAgentId?: string | null;
    forcedOwnerId?: string;
  },
): Promise<BookResult> {
  let resolved: { ownerId: string; conn: any } | null = null;
  if (args.forcedOwnerId) {
    const c = await getValidConnectionForUser(supabaseAdmin, args.forcedOwnerId);
    if (c) resolved = { ownerId: args.forcedOwnerId, conn: c };
  }
  if (!resolved) {
    resolved = await resolveOwnerWithConnection(supabaseAdmin, args.leadId, args.orgId, args.callerId);
  }
  if (!resolved) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId, lead_id: args.leadId, user_id: args.callerId ?? null,
      action: "error", error: "no_calendar_connection",
    });
    return { ok: false, reason: "no_connection", message: "Nenhuma agenda conectada para o responsável." };
  }
  const prefs = applyConnectionSlotPrefs(await loadOrgSlotPrefs(supabaseAdmin, args.orgId), resolved.conn);
  const startIso = new Date(args.startIso).toISOString();
  const endIso = args.endIso
    ? new Date(args.endIso).toISOString()
    : new Date(new Date(startIso).getTime() + prefs.durationMin * 60000).toISOString();
  const tz = BRAZIL_TIMEZONE;

  if (!isWithinSlotPrefs(startIso, endIso, prefs, tz)) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId, lead_id: args.leadId, user_id: resolved.ownerId,
      action: "error", provider: resolved.conn.provider, error: "outside_working_hours",
      payload: { startIso, endIso, timezone: tz, working_hours: { days: prefs.workingDays, start: prefs.workingStart, end: prefs.workingEnd } },
    });
    return { ok: false, reason: "conflict", message: "Horário fora da janela configurada da agenda." };
  }

  // 1) re-check external freeBusy
  try {
    const busy = resolved.conn.provider === "google"
      ? await googleFreeBusy({ accessToken: resolved.conn.access_token, timeMin: startIso, timeMax: endIso, timezone: tz })
      : await microsoftFreeBusy({ accessToken: resolved.conn.access_token, timeMin: startIso, timeMax: endIso, timezone: tz });
    if (busy.some((b) => new Date(b.start) < new Date(endIso) && new Date(b.end) > new Date(startIso))) {
      await logSchedulingEvent(supabaseAdmin, {
        organization_id: args.orgId, lead_id: args.leadId, user_id: resolved.ownerId,
        action: "error", provider: resolved.conn.provider, error: "conflict",
      });
      return { ok: false, reason: "conflict", message: "Horário acabou de ficar indisponível." };
    }
  } catch (e) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId, lead_id: args.leadId, user_id: resolved.ownerId,
      action: "error", provider: resolved.conn.provider, error: (e as Error).message,
    });
    return { ok: false, reason: "api_error", message: "Falha ao verificar disponibilidade." };
  }

  // 2) re-check meetings_v2 (avoid double-booking from internal source)
  const { data: dupes } = await supabaseAdmin
    .from("meetings_v2")
    .select("id")
    .eq("owner_user_id", resolved.ownerId)
    .eq("status", "scheduled")
    .lt("start_at", endIso)
    .gt("end_at", startIso)
    .limit(1);
  if ((dupes ?? []).length > 0) {
    return { ok: false, reason: "conflict", message: "Já existe outra reunião nesse horário." };
  }

  // 3) load lead
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, nome_fantasia, razao_social, email, whatsapp, telefone, segmento, cidade, estado, notes, source")
    .eq("id", args.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, reason: "lead_not_found", message: "Lead não encontrado." };
  const leadName = lead.razao_social || lead.nome_fantasia || "lead";
  const title = args.title || `Reunião Comercial - ${leadName}`;
  const description = [
    `Empresa: ${lead.razao_social || leadName}`,
    lead.nome_fantasia && `Responsável: ${lead.nome_fantasia}`,
    lead.whatsapp && `WhatsApp: ${lead.whatsapp}`,
    lead.telefone && `Telefone: ${lead.telefone}`,
    lead.email && `Email: ${lead.email}`,
    lead.segmento && `Segmento: ${lead.segmento}`,
    (lead.cidade || lead.estado) && `Local: ${[lead.cidade, lead.estado].filter(Boolean).join("/")}`,
    lead.source && `Origem: ${lead.source}`,
    args.notes && `\n${args.notes}`,
    lead.notes && `Observações: ${lead.notes}`,
  ].filter(Boolean).join("\n");
  const attendees = lead.email ? [{ email: lead.email, name: leadName }] : [];

  // 4) create event
  const t0 = Date.now();
  let eventId: string | undefined;
  let meetingUrl: string | undefined;
  try {
    if (resolved.conn.provider === "google") {
      const r = await googleCreateEvent({
        accessToken: resolved.conn.access_token, startIso, endIso, timezone: tz,
        summary: title, description, attendees, withMeet: true,
      });
      eventId = r.id; meetingUrl = r.meetingUrl;
    } else {
      const r = await microsoftCreateEvent({
        accessToken: resolved.conn.access_token, startIso, endIso, timezone: tz,
        subject: title, body: description, attendees, withTeams: true,
      });
      eventId = r.id; meetingUrl = r.meetingUrl;
    }
  } catch (e) {
    await logSchedulingEvent(supabaseAdmin, {
      organization_id: args.orgId, lead_id: args.leadId, user_id: resolved.ownerId,
      action: "error", provider: resolved.conn.provider, request_ms: Date.now() - t0, error: (e as Error).message,
    });
    return { ok: false, reason: "create_failed", message: "Não foi possível criar o evento na agenda." };
  }

  // 5) persist
  const baseRow = {
    organization_id: args.orgId,
    lead_id: args.leadId,
    owner_id: resolved.ownerId,
    provider: resolved.conn.provider,
    provider_event_id: eventId,
    title,
    notes: description,
    start_at: startIso,
    end_at: endIso,
    meeting_url: meetingUrl,
    attendees,
    status: "scheduled",
  };
  await supabaseAdmin.from("meetings").insert(baseRow as never);
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("meetings_v2")
    .insert({
      organization_id: args.orgId,
      lead_id: args.leadId,
      owner_user_id: resolved.ownerId,
      provider: resolved.conn.provider,
      external_event_id: eventId,
      meeting_url: meetingUrl,
      title,
      description,
      start_at: startIso,
      end_at: endIso,
      timezone: tz,
      status: "scheduled",
      attendees,
      created_via: args.createdVia ?? "manual",
      last_synced_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  if (insErr || !inserted) {
    return { ok: false, reason: "db_error", message: "Evento criado mas falhou ao salvar localmente." };
  }

  await supabaseAdmin.from("activity_events").insert({
    organization_id: args.orgId,
    lead_id: args.leadId,
    type: "calendar_meeting_created",
    payload: {
      meeting_id: inserted.id,
      start_at: startIso,
      end_at: endIso,
      meeting_url: meetingUrl,
      provider: resolved.conn.provider,
      owner_user_id: resolved.ownerId,
      created_via: args.createdVia ?? "manual",
      agent_id: args.createdByAgentId ?? null,
    },
  } as never);
  await logSchedulingEvent(supabaseAdmin, {
    organization_id: args.orgId, lead_id: args.leadId, user_id: resolved.ownerId,
    action: "create", provider: resolved.conn.provider, request_ms: Date.now() - t0,
    payload: { event_id: eventId, start: startIso, via: args.createdVia },
  });

  // 6) pause cadence + flag lead
  await supabaseAdmin
    .from("leads")
    .update({
      cadence_paused: true,
      status: "qualificado",
      owner_id: resolved.ownerId,
      responsible_user_id: resolved.ownerId,
    } as never)
    .eq("id", args.leadId);

  await supabaseAdmin.from("activity_events").insert({
    organization_id: args.orgId,
    lead_id: args.leadId,
    type: "lead_assigned_to_seller",
    payload: { seller_user_id: resolved.ownerId, via: args.createdVia ?? "manual" },
  } as never);

  return {
    ok: true, meetingId: inserted.id, eventId: eventId!, meetingUrl,
    startIso, endIso, provider: resolved.conn.provider, ownerId: resolved.ownerId,
  };
}