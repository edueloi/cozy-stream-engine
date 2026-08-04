import { toZonedNaive, zonedNaiveToUtcIso, type FreeSlot } from "@/lib/calendar.server";

export const BRAZIL_TIMEZONE = "America/Sao_Paulo";

export type SmartSlotPrefs = {
  durationMin: number;
  bufferMin: number;
  workingDays: number[]; // 0=Sun..6=Sat
  workingStart: string;  // "HH:MM"
  workingEnd: string;
  lunchStart?: string;
  lunchEnd?: string;
  minLeadTimeMin: number;
  maxDaysAhead: number;
  maxSlots?: number;
};

type CalendarConnectionPrefs = {
  working_hours?: { days?: number[]; start?: string; end?: string } | null;
  default_duration_min?: number | null;
};

export function applyConnectionSlotPrefs<T extends SmartSlotPrefs>(prefs: T, conn?: CalendarConnectionPrefs | null): T {
  const wh = conn?.working_hours;
  return {
    ...prefs,
    durationMin: conn?.default_duration_min ?? prefs.durationMin,
    workingDays: Array.isArray(wh?.days) && wh.days.length ? wh.days : prefs.workingDays,
    workingStart: wh?.start || prefs.workingStart,
    workingEnd: wh?.end || prefs.workingEnd,
  };
}

function parseHM(s: string) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isWithinSlotPrefs(startIso: string, endIso: string, prefs: SmartSlotPrefs, timeZone = BRAZIL_TIMEZONE) {
  const startLocal = toZonedNaive(startIso, timeZone);
  const endLocal = toZonedNaive(endIso, timeZone);
  const [datePart, startTime] = startLocal.split("T");
  const [endDatePart, endTime] = endLocal.split("T");
  if (datePart !== endDatePart) return false;
  const [y, mo, d] = datePart.split("-").map(Number);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  if (!prefs.workingDays.includes(dow)) return false;
  const startMin = parseHM(startTime.slice(0, 5));
  const endMin = parseHM(endTime.slice(0, 5));
  const wsMin = parseHM(prefs.workingStart);
  const weMin = parseHM(prefs.workingEnd);
  if (startMin < wsMin || endMin > weMin) return false;
  if (prefs.lunchStart && prefs.lunchEnd) {
    const lsMin = parseHM(prefs.lunchStart);
    const leMin = parseHM(prefs.lunchEnd);
    if (startMin < leMin && endMin > lsMin) return false;
  }
  return true;
}

/**
 * Smart slot picker:
 *  - respects working hours / days / lunch
 *  - applies buffer around busy intervals
 *  - enforces min lead time and max days ahead
 *  - scores: prefers slots adjacent to existing events (reduce empty gaps),
 *    penalises last hour of the day and tiny isolated gaps
 *  - returns top-N candidates, grouped by day if maxSlots is large
 */
export function computeSmartSlots(opts: {
  fromIso: string;
  busy: { start: string; end: string }[];
  prefs: SmartSlotPrefs;
  timeZone?: string;
}): FreeSlot[] {
  const timeZone = opts.timeZone || BRAZIL_TIMEZONE;
  const { durationMin, bufferMin, workingDays, workingStart, workingEnd, lunchStart, lunchEnd, minLeadTimeMin, maxDaysAhead } = opts.prefs;
  const max = opts.prefs.maxSlots ?? 5;
  const earliest = new Date(Date.now() + minLeadTimeMin * 60000);
  const fromDate = new Date(opts.fromIso);
  const start = fromDate > earliest ? fromDate : earliest;

  const wsMin = parseHM(workingStart);
  const weMin = parseHM(workingEnd);
  const lsMin = lunchStart ? parseHM(lunchStart) : null;
  const leMin = lunchEnd ? parseHM(lunchEnd) : null;

  // expand busy with buffer
  const busy = opts.busy.map((b) => ({
    start: new Date(new Date(b.start).getTime() - bufferMin * 60000),
    end: new Date(new Date(b.end).getTime() + bufferMin * 60000),
  }));

  type Candidate = FreeSlot & { score: number };
  const candidates: Candidate[] = [];
  const startLocal = toZonedNaive(start.toISOString(), timeZone).slice(0, 10);
  const [sy, sm, sd] = startLocal.split("-").map(Number);

  for (let d = 0; d < maxDaysAhead; d++) {
    const localDay = new Date(Date.UTC(sy, sm - 1, sd + d, 12));
    const y = localDay.getUTCFullYear();
    const mo = localDay.getUTCMonth() + 1;
    const dayNum = localDay.getUTCDate();
    if (!workingDays.includes(new Date(Date.UTC(y, mo - 1, dayNum)).getUTCDay())) continue;
    const dateKey = `${y}-${String(mo).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    for (let m = wsMin; m + durationMin <= weMin; m += 30) {
      // skip lunch
      if (lsMin !== null && leMin !== null && m < leMin && m + durationMin > lsMin) continue;
      const hour = String(Math.floor(m / 60)).padStart(2, "0");
      const minute = String(m % 60).padStart(2, "0");
      const slotStart = new Date(zonedNaiveToUtcIso(`${dateKey}T${hour}:${minute}:00`, timeZone));
      if (slotStart < start) continue;
      const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
      const conflicts = busy.some((b) => b.start < slotEnd && b.end > slotStart);
      if (conflicts) continue;

      // score
      let score = 100;
      // prefer slots adjacent to busy events (compact agenda)
      const adjacent = busy.some(
        (b) =>
          Math.abs(b.end.getTime() - slotStart.getTime()) <= 30 * 60000 ||
          Math.abs(slotEnd.getTime() - b.start.getTime()) <= 30 * 60000,
      );
      if (adjacent) score += 20;
      // penalise last 60 min of workday
      if (m + durationMin >= weMin - 60) score -= 15;
      // small isolation: surround by huge empty (low priority)
      // mild bonus to mornings
      if (m < 11 * 60) score += 5;

      candidates.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), score });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
  // dedupe: pick at most 2 per day to spread options
  const perDay = new Map<string, number>();
  const picked: FreeSlot[] = [];
  for (const c of candidates) {
    const day = c.start.slice(0, 10);
    const n = perDay.get(day) ?? 0;
    if (n >= 2) continue;
    perDay.set(day, n + 1);
    picked.push({ start: c.start, end: c.end });
    if (picked.length >= max) break;
  }
  // ensure chronological for display
  picked.sort((a, b) => a.start.localeCompare(b.start));
  return picked;
}

/**
 * Pull org defaults for slot picking. Returns a fully-formed SmartSlotPrefs.
 */
export async function loadOrgSlotPrefs(
  supabaseAdmin: any,
  orgId: string,
  override?: { durationMin?: number },
): Promise<SmartSlotPrefs> {
  const { data: s } = await supabaseAdmin
    .from("app_settings")
    .select(
      "meeting_default_duration_min, meeting_buffer_min, meeting_lunch_start, meeting_lunch_end, meeting_working_days, meeting_working_start, meeting_working_end, meeting_min_lead_time_min, meeting_max_days_ahead",
    )
    .eq("organization_id", orgId)
    .maybeSingle();
  return {
    durationMin: override?.durationMin ?? s?.meeting_default_duration_min ?? 30,
    bufferMin: s?.meeting_buffer_min ?? 10,
    workingDays: s?.meeting_working_days ?? [1, 2, 3, 4, 5],
    workingStart: s?.meeting_working_start ?? "09:00",
    workingEnd: s?.meeting_working_end ?? "18:00",
    lunchStart: s?.meeting_lunch_start ?? "12:00",
    lunchEnd: s?.meeting_lunch_end ?? "13:00",
    minLeadTimeMin: s?.meeting_min_lead_time_min ?? 60,
    maxDaysAhead: s?.meeting_max_days_ahead ?? 14,
    maxSlots: 5,
  };
}

export async function logSchedulingEvent(
  supabaseAdmin: any,
  row: {
    organization_id: string;
    lead_id?: string | null;
    user_id?: string | null;
    action: string;
    provider?: string | null;
    request_ms?: number | null;
    http_status?: number | null;
    payload?: Record<string, unknown> | null;
    error?: string | null;
  },
) {
  try {
    await supabaseAdmin.from("scheduling_logs").insert(row as never);
  } catch {
    /* logs never break flow */
  }
}