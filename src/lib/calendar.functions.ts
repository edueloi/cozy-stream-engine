import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listCalendarConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_connections")
      .select("id, provider, email, timezone, working_hours, default_duration_min, enabled, expires_at, created_at, updated_at, user_id")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOrgOAuthConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // OAuth credentials are platform-level (env). Always available to users.
    return {
      google: !!process.env.GOOGLE_OAUTH_CLIENT_ID && !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      microsoft: !!process.env.MS_OAUTH_CLIENT_ID && !!process.env.MS_OAUTH_CLIENT_SECRET,
      ms_tenant: process.env.MS_OAUTH_TENANT ?? "common",
    };
  });

function originFromHost(host: string | null) {
  if (!host) throw new Error("Sem host de origem");
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

export const startCalendarOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: "google" | "microsoft" }) =>
    z.object({ provider: z.enum(["google", "microsoft"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signState, googleAuthUrl, microsoftAuthUrl } = await import("@/lib/calendar.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Usuário sem empresa associada.");
    const origin = originFromHost(getRequestHost());
    const redirectUri = `${origin}/api/public/calendar/oauth/callback`;
    const state = signState({ user_id: context.userId, organization_id: orgId, provider: data.provider });
    if (data.provider === "google") {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      if (!clientId) throw new Error("Integração com Google indisponível no momento.");
      return { url: googleAuthUrl({ clientId, redirectUri, state }) };
    }
    const msClientId = process.env.MS_OAUTH_CLIENT_ID;
    if (!msClientId) throw new Error("Integração com Microsoft indisponível no momento.");
    return { url: microsoftAuthUrl({ clientId: msClientId, tenant: process.env.MS_OAUTH_TENANT ?? "common", redirectUri, state }) };
  });

export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: "google" | "microsoft" }) =>
    z.object({ provider: z.enum(["google", "microsoft"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const prefsSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  timezone: z.string().optional(),
  default_duration_min: z.number().int().min(15).max(240).optional(),
  working_hours: z.object({
    days: z.array(z.number().int().min(0).max(6)),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }).optional(),
  enabled: z.boolean().optional(),
  buffer_before_min: z.number().int().min(0).max(120).optional(),
  buffer_after_min: z.number().int().min(0).max(120).optional(),
  calendar_id: z.string().optional(),
});
export const updateCalendarPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: z.infer<typeof prefsSchema>) => prefsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.timezone) patch.timezone = data.timezone;
    if (data.default_duration_min) patch.default_duration_min = data.default_duration_min;
    if (data.working_hours) patch.working_hours = data.working_hours;
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    if (typeof data.buffer_before_min === "number") patch.buffer_before_min = data.buffer_before_min;
    if (typeof data.buffer_after_min === "number") patch.buffer_after_min = data.buffer_after_min;
    if (typeof data.calendar_id === "string") patch.calendar_id = data.calendar_id;
    const { error } = await context.supabase
      .from("calendar_connections")
      .update(patch as never)
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrgCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_org_calendar_status");
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

export const requestCalendarConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gerentes/admins podem solicitar conexão.");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof?.organization_id) throw new Error("Sem empresa.");
    await supabaseAdmin.from("activity_events").insert({
      organization_id: prof.organization_id,
      type: "calendar_connection_requested",
      payload: { requested_by: context.userId, target_user_id: data.userId },
    } as never);
    return { ok: true };
  });

async function getValidConnection(supabaseAdmin: any, userId: string, orgId: string) {
  const { data: conn } = await supabaseAdmin
    .from("calendar_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conn) return null;
  void orgId; // not used after platform-level OAuth refactor
  // refresh if expired
  const expSoon = !conn.expires_at || new Date(conn.expires_at).getTime() < Date.now() + 60000;
  if (expSoon && conn.refresh_token) {
    const { refreshGoogleToken, refreshMicrosoftToken } = await import("@/lib/calendar.server");
    let tok;
    if (conn.provider === "google") {
      const cid = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const cs = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!cid || !cs) throw new Error("Integração com Google indisponível.");
      tok = await refreshGoogleToken({ refreshToken: conn.refresh_token, clientId: cid, clientSecret: cs });
    } else {
      const cid = process.env.MS_OAUTH_CLIENT_ID;
      const cs = process.env.MS_OAUTH_CLIENT_SECRET;
      if (!cid || !cs) throw new Error("Integração com Microsoft indisponível.");
      tok = await refreshMicrosoftToken({ refreshToken: conn.refresh_token, clientId: cid, clientSecret: cs, tenant: process.env.MS_OAUTH_TENANT ?? "common" });
    }
    const expires_at = new Date(Date.now() + tok.expires_in * 1000).toISOString();
    await supabaseAdmin
      .from("calendar_connections")
      .update({ access_token: tok.access_token, refresh_token: tok.refresh_token ?? conn.refresh_token, expires_at } as never)
      .eq("id", conn.id);
    conn.access_token = tok.access_token;
    conn.expires_at = expires_at;
  }
  return conn;
}

export const findFreeSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { daysAhead?: number; durationMin?: number }) =>
    z.object({ daysAhead: z.number().int().min(1).max(30).optional(), durationMin: z.number().int().min(15).max(240).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem empresa.");
    const conn = await getValidConnection(supabaseAdmin, context.userId, orgId);
    if (!conn) throw new Error("Conecte sua agenda primeiro.");
    const { googleFreeBusy, microsoftFreeBusy, computeFreeSlots } = await import("@/lib/calendar.server");
    const days = data.daysAhead ?? 5;
    const dur = data.durationMin ?? conn.default_duration_min ?? 30;
    const timeMin = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + days * 86400000).toISOString();
    const busy = conn.provider === "google"
      ? await googleFreeBusy({ accessToken: conn.access_token, timeMin, timeMax, timezone: conn.timezone })
      : await microsoftFreeBusy({ accessToken: conn.access_token, timeMin, timeMax, timezone: conn.timezone });
    const workingHours = conn.working_hours && typeof conn.working_hours === "object"
      ? conn.working_hours
      : { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };
    return computeFreeSlots({ fromIso: timeMin, daysAhead: days, durationMin: dur, workingHours, busy, maxSlots: 5, timezone: "America/Sao_Paulo" });
  });

export const createMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string; startIso: string; durationMin?: number; title?: string; notes?: string }) =>
    z.object({
      leadId: z.string().uuid(),
      startIso: z.string(),
      durationMin: z.number().int().min(15).max(240).optional(),
      title: z.string().optional(),
      notes: z.string().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem empresa.");
    const startIso = new Date(data.startIso).toISOString();
    const endIso = data.durationMin ? new Date(new Date(startIso).getTime() + data.durationMin * 60000).toISOString() : undefined;
    const { bookSlotForLead } = await import("@/lib/scheduling-book.server");
    const result = await bookSlotForLead(supabaseAdmin, {
      orgId,
      leadId: data.leadId,
      startIso,
      endIso,
      title: data.title,
      notes: data.notes,
      callerId: context.userId,
      createdVia: "manual_calendar_ui",
    });
    if (!result.ok) throw new Error(result.message);
    return { ok: true, meetingUrl: result.meetingUrl, startAt: result.startIso, endAt: result.endIso };
  });

export const listMeetingsForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meetings")
      .select("id, provider, title, start_at, end_at, meeting_url, status")
      .eq("lead_id", data.leadId)
      .order("start_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---- Calendar mirror (list / delete events on the user's external calendar) ----

export const listMyCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { fromIso?: string; toIso?: string; daysAhead?: number; userId?: string }) =>
    z.object({
      fromIso: z.string().optional(),
      toIso: z.string().optional(),
      daysAhead: z.number().int().min(1).max(60).optional(),
      userId: z.string().uuid().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem empresa.");
    let targetUserId = context.userId;
    if (data.userId && data.userId !== context.userId) {
      const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
      if (!isMgr) throw new Error("Sem permissão para ver agenda de outro usuário.");
      const { data: targetProf } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (!targetProf || targetProf.organization_id !== orgId) {
        throw new Error("Usuário não encontrado na sua empresa.");
      }
      targetUserId = data.userId;
    }
    const conn = await getValidConnection(supabaseAdmin, targetUserId, orgId);
    if (!conn) {
      return { provider: null as null, timezone: null as null, events: [] as Array<import("@/lib/calendar.server").MirrorEvent> };
    }
    const { googleListEvents, microsoftListEvents } = await import("@/lib/calendar.server");
    const timeMin = data.fromIso ?? new Date().toISOString();
    const days = data.daysAhead ?? 14;
    const timeMax = data.toIso ?? new Date(Date.now() + days * 86400000).toISOString();
    const events = conn.provider === "google"
      ? await googleListEvents({ accessToken: conn.access_token, timeMin, timeMax, timezone: conn.timezone })
      : await microsoftListEvents({ accessToken: conn.access_token, timeMin, timeMax, timezone: conn.timezone });
    return { provider: conn.provider as "google" | "microsoft", timezone: conn.timezone as string, events };
  });

export const listOrgCalendarUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) return [] as Array<{ user_id: string; name: string | null; email: string | null; provider: string | null }>;
    const { data, error } = await context.supabase.rpc("list_org_calendar_status");
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[])
      .filter((r) => r.connected)
      .map((r) => ({ user_id: r.user_id, name: r.name, email: r.email, provider: r.provider }));
  });

export const deleteMyCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { eventId: string }) => z.object({ eventId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem empresa.");
    const conn = await getValidConnection(supabaseAdmin, context.userId, orgId);
    if (!conn) throw new Error("Conecte sua agenda primeiro.");
    const { googleDeleteEvent, microsoftDeleteEvent } = await import("@/lib/calendar.server");
    if (conn.provider === "google") {
      await googleDeleteEvent({ accessToken: conn.access_token, eventId: data.eventId });
    } else {
      await microsoftDeleteEvent({ accessToken: conn.access_token, eventId: data.eventId });
    }
    // Mirror cancellation on local meetings if present
    await supabaseAdmin
      .from("meetings")
      .update({ status: "cancelled" } as never)
      .eq("organization_id", orgId)
      .eq("owner_id", context.userId)
      .eq("provider_event_id", data.eventId);
    return { ok: true };
  });