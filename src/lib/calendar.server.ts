import { createHmac, timingSafeEqual } from "crypto";

// ---- Timezone helpers (always Brazil/São Paulo for this product) ----
/** Format a UTC ISO string as naive "YYYY-MM-DDTHH:mm:ss" in the given IANA tz. */
export function toZonedNaive(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  // en-CA gives ISO-like date; hour can be "24" at midnight — normalize.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/** Inverse: interpret a naive "YYYY-MM-DDTHH:mm:ss" as a wall-clock time in the
 * given IANA tz and return the corresponding UTC ISO string. */
export function zonedNaiveToUtcIso(naive: string, timeZone: string): string {
  // Strip any accidental Z or offset.
  const clean = naive.replace(/Z$/, "").replace(/[+-]\d{2}:?\d{2}$/, "");
  const [datePart, timePart = "00:00:00"] = clean.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s = 0] = timePart.split(":").map(Number);
  // Guess: treat as UTC, then adjust by the tz offset at that instant.
  const guessUtc = Date.UTC(y, mo - 1, d, h, mi, Number(s) || 0);
  // Compute what that UTC instant looks like in the target tz, and the diff
  // tells us the offset to subtract.
  const asLocalNaive = toZonedNaive(new Date(guessUtc).toISOString(), timeZone);
  const [aDate, aTime] = asLocalNaive.split("T");
  const [ay, amo, ad] = aDate.split("-").map(Number);
  const [ah, ami, as_] = aTime.split(":").map(Number);
  const asLocalUtc = Date.UTC(ay, amo - 1, ad, ah, ami, as_);
  const offsetMs = asLocalUtc - guessUtc;
  return new Date(guessUtc - offsetMs).toISOString();
}

function hmacSecret() {
  return process.env.APP_INTERNAL_TOKEN || "jcs-sdr-calendar";
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(input: string) {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signState(payload: Record<string, unknown>) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 }));
  const sig = b64url(createHmac("sha256", hmacSecret()).update(body).digest());
  return `${body}.${sig}`;
}
export function verifyState(state: string): Record<string, unknown> | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", hmacSecret()).update(body).digest();
  const got = b64urlDecode(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as Record<string, unknown>;
  if (typeof payload.exp === "number" && payload.exp < Date.now()) return null;
  return payload;
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
].join(" ");

export const MS_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "Calendars.ReadWrite",
].join(" ");

export function googleAuthUrl(opts: { clientId: string; redirectUri: string; state: string }) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("scope", GOOGLE_SCOPES);
  u.searchParams.set("state", opts.state);
  return u.toString();
}
export function microsoftAuthUrl(opts: { clientId: string; tenant?: string; redirectUri: string; state: string }) {
  const tenant = opts.tenant || "common";
  const authority = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
  const u = new URL(authority);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", MS_SCOPES);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("prompt", "select_account");
  console.log("[ms-oauth:calendar] authority=%s tenant=%s prompt=select_account scopes=%s", authority, tenant, MS_SCOPES);
  return u.toString();
}

type TokenResp = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };

export async function exchangeGoogleCode(opts: { code: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<TokenResp & { email?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  const json = (await res.json()) as TokenResp & { id_token?: string };
  if (!res.ok) throw new Error(`Google token exchange: ${JSON.stringify(json)}`);
  let email: string | undefined;
  try {
    if (json.id_token) {
      const payload = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64").toString("utf8"));
      email = payload.email;
    }
  } catch { /* ignore */ }
  if (!email) {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${json.access_token}` } });
    if (r.ok) email = ((await r.json()) as { email?: string }).email;
  }
  return { ...json, email };
}
export async function refreshGoogleToken(opts: { refreshToken: string; clientId: string; clientSecret: string }): Promise<TokenResp> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const json = (await res.json()) as TokenResp;
  if (!res.ok) throw new Error(`Google refresh: ${JSON.stringify(json)}`);
  return json;
}

export async function exchangeMicrosoftCode(opts: { code: string; clientId: string; clientSecret: string; redirectUri: string; tenant?: string }): Promise<TokenResp & { email?: string }> {
  const tenant = opts.tenant || "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
      scope: MS_SCOPES,
    }).toString(),
  });
  const json = (await res.json()) as TokenResp & { id_token?: string };
  if (!res.ok) {
    const j = json as unknown as { error?: string; error_codes?: number[]; error_description?: string };
    console.error("[ms-oauth:calendar] exchange failed tenant=%s error=%s codes=%s desc=%s", tenant, j.error, JSON.stringify(j.error_codes), j.error_description);
    throw new Error(`Microsoft token exchange: ${j.error ?? "unknown"} ${JSON.stringify(j.error_codes ?? [])}`);
  }
  let email: string | undefined;
  try {
    if (json.id_token) {
      const payload = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64").toString("utf8"));
      email = payload.email || payload.preferred_username;
      const tid = (payload as { tid?: string }).tid;
      if (tid) console.log("[ms-oauth:calendar] token tenant tid=%s", tid);
    }
  } catch { /* ignore */ }
  return { ...json, email };
}
export async function refreshMicrosoftToken(opts: { refreshToken: string; clientId: string; clientSecret: string; tenant?: string }): Promise<TokenResp> {
  const tenant = opts.tenant || "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
      grant_type: "refresh_token",
      scope: MS_SCOPES,
    }).toString(),
  });
  const json = (await res.json()) as TokenResp;
  if (!res.ok) throw new Error(`Microsoft refresh: ${JSON.stringify(json)}`);
  return json;
}

// ---- Calendar API helpers ----

export type FreeSlot = { start: string; end: string };

export async function googleFreeBusy(opts: { accessToken: string; timeMin: string; timeMax: string; timezone: string }) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: opts.timeMin, timeMax: opts.timeMax, timeZone: opts.timezone, items: [{ id: "primary" }] }),
  });
  const json = (await res.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
  if (!res.ok) throw new Error(`Google freeBusy: ${JSON.stringify(json)}`);
  return json.calendars?.primary?.busy ?? [];
}

export async function microsoftFreeBusy(opts: { accessToken: string; timeMin: string; timeMax: string; timezone: string }) {
  const tz = "America/Sao_Paulo";
  const startNaive = toZonedNaive(opts.timeMin, tz);
  const endNaive = toZonedNaive(opts.timeMax, tz);
  const res = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json", Prefer: `outlook.timezone="${tz}"` },
    body: JSON.stringify({
      schedules: ["me"],
      startTime: { dateTime: startNaive, timeZone: tz },
      endTime: { dateTime: endNaive, timeZone: tz },
      availabilityViewInterval: 30,
    }),
  });
  const json = (await res.json()) as { value?: { scheduleItems?: { start: { dateTime: string }; end: { dateTime: string }; status?: string }[] }[] };
  if (!res.ok) throw new Error(`Microsoft getSchedule: ${JSON.stringify(json)}`);
  const items = json.value?.[0]?.scheduleItems ?? [];
  return items
    .filter((i) => i.status !== "free")
    .map((i) => ({ start: zonedNaiveToUtcIso(i.start.dateTime, tz), end: zonedNaiveToUtcIso(i.end.dateTime, tz) }));
}

export async function googleCreateEvent(opts: {
  accessToken: string;
  startIso: string;
  endIso: string;
  timezone: string;
  summary: string;
  description?: string;
  attendees?: { email: string; name?: string }[];
  withMeet?: boolean;
}) {
  const body: Record<string, unknown> = {
    summary: opts.summary,
    description: opts.description,
    start: { dateTime: opts.startIso, timeZone: opts.timezone },
    end: { dateTime: opts.endIso, timeZone: opts.timezone },
    attendees: opts.attendees?.map((a) => ({ email: a.email, displayName: a.name })) ?? [],
  };
  if (opts.withMeet) {
    body.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  }
  const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all";
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as { id?: string; hangoutLink?: string; htmlLink?: string };
  if (!res.ok) throw new Error(`Google createEvent: ${JSON.stringify(json)}`);
  return { id: json.id!, meetingUrl: json.hangoutLink || json.htmlLink };
}

export async function googleUpdateEvent(opts: {
  accessToken: string;
  eventId: string;
  startIso: string;
  endIso: string;
  timezone: string;
  summary?: string;
  description?: string;
  attendees?: { email: string; name?: string }[];
}) {
  const body: Record<string, unknown> = {
    start: { dateTime: opts.startIso, timeZone: opts.timezone },
    end: { dateTime: opts.endIso, timeZone: opts.timezone },
  };
  if (opts.summary) body.summary = opts.summary;
  if (opts.description) body.description = opts.description;
  if (opts.attendees) body.attendees = opts.attendees.map((a) => ({ email: a.email, displayName: a.name }));
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(opts.eventId)}?sendUpdates=all`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; hangoutLink?: string; htmlLink?: string };
  if (!res.ok) throw new Error(`Google updateEvent: ${JSON.stringify(json)}`);
  return { id: json.id!, meetingUrl: json.hangoutLink || json.htmlLink };
}

export async function microsoftCreateEvent(opts: {
  accessToken: string;
  startIso: string;
  endIso: string;
  timezone: string;
  subject: string;
  body?: string;
  attendees?: { email: string; name?: string }[];
  withTeams?: boolean;
}) {
  // Graph expects a NAIVE datetime (no trailing Z / offset) paired with the
  // IANA timeZone label. Sending UTC ISO with "Z" triggers
  // ErrorIrresolvableConflict when isOnlineMeeting=true. Always send the
  // value as Brazil/São Paulo local time.
  const tz = "America/Sao_Paulo";
  const startNaive = toZonedNaive(opts.startIso, tz);
  const endNaive = toZonedNaive(opts.endIso, tz);
  const buildPayload = (withTeams: boolean): Record<string, unknown> => ({
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.body ?? "" },
    start: { dateTime: startNaive, timeZone: tz },
    end: { dateTime: endNaive, timeZone: tz },
    attendees: (opts.attendees ?? []).map((a) => ({ emailAddress: { address: a.email, name: a.name }, type: "required" })),
    isOnlineMeeting: withTeams,
    ...(withTeams ? { onlineMeetingProvider: "teamsForBusiness" } : {}),
  });
  const callGraph = async (withTeams: boolean) =>
    fetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(withTeams)),
    });
  let res = await callGraph(!!opts.withTeams);
  let json = (await res.json()) as { id?: string; onlineMeeting?: { joinUrl?: string }; webLink?: string; error?: { code?: string; message?: string } };
  // Known Graph quirk: ErrorIrresolvableConflict on POST /me/events when the
  // mailbox cannot provision a Teams meeting. Retry once without it.
  if (!res.ok && opts.withTeams) {
    const raw = JSON.stringify(json);
    if (/ErrorIrresolvableConflict|onlineMeeting|Teams/i.test(raw)) {
      res = await callGraph(false);
      json = (await res.json()) as typeof json;
    }
  }
  if (!res.ok) throw new Error(`Microsoft createEvent: ${JSON.stringify(json)}`);
  return { id: json.id!, meetingUrl: json.onlineMeeting?.joinUrl || json.webLink };
}

export async function microsoftUpdateEvent(opts: {
  accessToken: string;
  eventId: string;
  startIso: string;
  endIso: string;
  timezone: string;
  subject?: string;
  body?: string;
  attendees?: { email: string; name?: string }[];
}) {
  const tz = "America/Sao_Paulo";
  const payload: Record<string, unknown> = {
    start: { dateTime: toZonedNaive(opts.startIso, tz), timeZone: tz },
    end: { dateTime: toZonedNaive(opts.endIso, tz), timeZone: tz },
  };
  if (opts.subject) payload.subject = opts.subject;
  if (opts.body) payload.body = { contentType: "HTML", content: opts.body };
  if (opts.attendees) payload.attendees = opts.attendees.map((a) => ({ emailAddress: { address: a.email, name: a.name }, type: "required" }));
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(opts.eventId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json", Prefer: `outlook.timezone="${tz}"` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(`Microsoft updateEvent: ${JSON.stringify(json)}`);
  }
  const json = await res.json().catch(() => ({})) as { id?: string; onlineMeeting?: { joinUrl?: string }; webLink?: string };
  return { id: json.id || opts.eventId, meetingUrl: json.onlineMeeting?.joinUrl || json.webLink };
}

// Compute candidate slots given busy intervals + working hours
export function computeFreeSlots(opts: {
  fromIso: string;
  daysAhead: number;
  durationMin: number;
  workingHours: { days: number[]; start: string; end: string };
  busy: { start: string; end: string }[];
  maxSlots?: number;
  timezone?: string;
}): FreeSlot[] {
  const tz = opts.timezone || "America/Sao_Paulo";
  const slots: FreeSlot[] = [];
  const max = opts.maxSlots ?? 3;
  const start = new Date(opts.fromIso);
  const startMin = parseHM(opts.workingHours.start);
  const endMin = parseHM(opts.workingHours.end);
  const startLocal = toZonedNaive(start.toISOString(), tz).slice(0, 10);
  const [sy, sm, sd] = startLocal.split("-").map(Number);
  for (let d = 0; d < opts.daysAhead && slots.length < max; d++) {
    const localDay = new Date(Date.UTC(sy, sm - 1, sd + d, 12));
    const y = localDay.getUTCFullYear();
    const mo = localDay.getUTCMonth() + 1;
    const dayNum = localDay.getUTCDate();
    if (!opts.workingHours.days.includes(new Date(Date.UTC(y, mo - 1, dayNum)).getUTCDay())) continue;
    const dateKey = `${y}-${String(mo).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    for (let m = startMin; m + opts.durationMin <= endMin; m += 30) {
      const hour = String(Math.floor(m / 60)).padStart(2, "0");
      const minute = String(m % 60).padStart(2, "0");
      const slotStart = new Date(zonedNaiveToUtcIso(`${dateKey}T${hour}:${minute}:00`, tz));
      if (slotStart < start) continue;
      const slotEnd = new Date(slotStart.getTime() + opts.durationMin * 60000);
      const conflicts = opts.busy.some((b) => new Date(b.start) < slotEnd && new Date(b.end) > slotStart);
      if (!conflicts) {
        slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
        if (slots.length >= max) break;
      }
    }
  }
  return slots;
}
function parseHM(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ---- List & delete events (mirror) ----

export type MirrorEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string | null;
  attendees?: { email?: string; name?: string }[];
  meetingUrl?: string | null;
  htmlLink?: string | null;
  organizer?: string | null;
};

export async function googleListEvents(opts: { accessToken: string; timeMin: string; timeMax: string; timezone: string }): Promise<MirrorEvent[]> {
  const u = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  u.searchParams.set("timeMin", opts.timeMin);
  u.searchParams.set("timeMax", opts.timeMax);
  u.searchParams.set("singleEvents", "true");
  u.searchParams.set("orderBy", "startTime");
  u.searchParams.set("maxResults", "100");
  u.searchParams.set("timeZone", opts.timezone);
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${opts.accessToken}` } });
  const json = (await res.json()) as { items?: Array<{ id: string; summary?: string; location?: string; htmlLink?: string; hangoutLink?: string; organizer?: { email?: string }; attendees?: { email?: string; displayName?: string }[]; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }> };
  if (!res.ok) throw new Error(`Google listEvents: ${JSON.stringify(json)}`);
  return (json.items ?? []).map((e) => ({
    id: e.id,
    title: e.summary || "(sem título)",
    start: e.start.dateTime || e.start.date || "",
    end: e.end.dateTime || e.end.date || "",
    allDay: !e.start.dateTime,
    location: e.location ?? null,
    attendees: (e.attendees ?? []).map((a) => ({ email: a.email, name: a.displayName })),
    meetingUrl: e.hangoutLink ?? null,
    htmlLink: e.htmlLink ?? null,
    organizer: e.organizer?.email ?? null,
  }));
}

export async function googleDeleteEvent(opts: { accessToken: string; eventId: string }) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(opts.eventId)}?sendUpdates=all`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    const t = await res.text().catch(() => "");
    throw new Error(`Google deleteEvent: ${res.status} ${t}`);
  }
}

export async function microsoftListEvents(opts: { accessToken: string; timeMin: string; timeMax: string; timezone: string }): Promise<MirrorEvent[]> {
  const u = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
  u.searchParams.set("startDateTime", opts.timeMin);
  u.searchParams.set("endDateTime", opts.timeMax);
  u.searchParams.set("$orderby", "start/dateTime");
  u.searchParams.set("$top", "100");
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${opts.accessToken}`, Prefer: `outlook.timezone="${opts.timezone}"` },
  });
  const json = (await res.json()) as { value?: Array<{ id: string; subject?: string; webLink?: string; isAllDay?: boolean; location?: { displayName?: string }; organizer?: { emailAddress?: { address?: string } }; attendees?: { emailAddress?: { address?: string; name?: string } }[]; onlineMeeting?: { joinUrl?: string }; start: { dateTime: string }; end: { dateTime: string } }> };
  if (!res.ok) throw new Error(`Microsoft listEvents: ${JSON.stringify(json)}`);
  return (json.value ?? []).map((e) => ({
    id: e.id,
    title: e.subject || "(sem título)",
    start: e.start.dateTime,
    end: e.end.dateTime,
    allDay: !!e.isAllDay,
    location: e.location?.displayName ?? null,
    attendees: (e.attendees ?? []).map((a) => ({ email: a.emailAddress?.address, name: a.emailAddress?.name })),
    meetingUrl: e.onlineMeeting?.joinUrl ?? null,
    htmlLink: e.webLink ?? null,
    organizer: e.organizer?.emailAddress?.address ?? null,
  }));
}

export async function microsoftDeleteEvent(opts: { accessToken: string; eventId: string }) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(opts.eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const t = await res.text().catch(() => "");
    throw new Error(`Microsoft deleteEvent: ${res.status} ${t}`);
  }
}
