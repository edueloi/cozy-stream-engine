// Pure helpers for the meeting follow-up cron. No I/O, no DB — easy to unit test.
// See docs/release-notes/1.4.3-meeting-lifecycle.md.

export type MeetingRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  reminder_24h_sent_at?: string | null;
  reminder_2h_sent_at?: string | null;
  reminder_same_day_sent_at?: string | null;
  no_show_message_sent_at?: string | null;
  outcome_overdue_alerted_at?: string | null;
  confirmation_status?: string | null;
};

export type LifecycleAction =
  | { kind: "skip"; reason: string }
  | { kind: "send_reminder_24h" }
  | { kind: "send_reminder_2h" }
  | { kind: "mark_awaiting_outcome" }
  | { kind: "mark_outcome_overdue" };

/** Statuses we consider "terminal" and never touch again. */
const TERMINAL = new Set([
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
]);

/**
 * Given the current time and a meeting row, decide what to do next.
 * The rule of thumb: never send a "future" reminder if start_at is in the past.
 */
export function classifyMeetingLifecycle(
  now: Date,
  m: MeetingRow,
  opts: { outcomeOverdueHours?: number } = {},
): LifecycleAction {
  if (TERMINAL.has(m.status)) return { kind: "skip", reason: "terminal" };

  const start = new Date(m.start_at).getTime();
  const end = new Date(m.end_at).getTime();
  const nowMs = now.getTime();

  // Meeting already ended.
  if (end <= nowMs) {
    const overdueMs = (opts.outcomeOverdueHours ?? 4) * 3600 * 1000;
    if (nowMs - end >= overdueMs && !m.outcome_overdue_alerted_at) {
      return { kind: "mark_outcome_overdue" };
    }
    if (m.status === "scheduled" || m.status === "reminder_sent" || m.status === "awaiting_start") {
      return { kind: "mark_awaiting_outcome" };
    }
    return { kind: "skip", reason: "already_awaiting_outcome" };
  }

  // Meeting in progress: leave alone.
  if (start <= nowMs && nowMs < end) return { kind: "skip", reason: "in_progress" };

  const untilStart = start - nowMs;

  // 2h window: [-30min .. -2h] before start, sent once.
  const twoHours = 2 * 3600 * 1000;
  const thirtyMin = 30 * 60 * 1000;
  if (untilStart <= twoHours && untilStart >= thirtyMin && !m.reminder_2h_sent_at) {
    return { kind: "send_reminder_2h" };
  }

  // 24h window: [22h .. 26h] before start, sent once.
  const day = 24 * 3600 * 1000;
  if (untilStart <= day + 2 * 3600 * 1000 && untilStart >= day - 2 * 3600 * 1000 && !m.reminder_24h_sent_at) {
    return { kind: "send_reminder_24h" };
  }

  return { kind: "skip", reason: "no_window" };
}

/**
 * Build reminder text using the REAL meeting timestamp — never trust
 * pre-formatted strings from previous conversations.
 */
export function buildReminderText(opts: {
  now: Date;
  startAt: Date;
  leadName?: string | null;
  meetingUrl?: string | null;
  timezone?: string;
  kind: "24h" | "2h" | "same_day";
}): string {
  const tz = opts.timezone || "America/Sao_Paulo";
  const sameDay = isSameLocalDay(opts.now, opts.startAt, tz);
  const timeStr = formatTime(opts.startAt, tz);
  const dayRef = sameDay ? "hoje" : isTomorrow(opts.now, opts.startAt, tz) ? "amanhã" : formatDate(opts.startAt, tz);
  const name = opts.leadName?.trim() || "tudo bem";
  const link = opts.meetingUrl ? `\nLink: ${opts.meetingUrl}` : "";
  if (opts.kind === "2h") {
    return `Olá, ${name}. Passando para lembrar da nossa reunião ${dayRef}, às ${timeStr}.${link}\nCaso precise alterar o horário, é só me avisar.`;
  }
  return `Olá, ${name}. Passando para lembrar da nossa reunião ${dayRef}, às ${timeStr}.${link}\nCaso precise alterar o horário, é só me avisar.`;
}

export function buildNoShowText(opts: { leadName?: string | null }): string {
  const name = opts.leadName?.trim() || "tudo bem";
  return `Olá, ${name}. Percebi que talvez você não tenha conseguido participar da nossa reunião. Sem problema — podemos remarcar para um horário mais conveniente para você?`;
}

function fmtParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}
function formatTime(d: Date, tz: string) {
  const p = fmtParts(d, tz);
  return `${p.h}:${p.min}`;
}
function formatDate(d: Date, tz: string) {
  const p = fmtParts(d, tz);
  return `${p.d}/${p.m}`;
}
function isSameLocalDay(a: Date, b: Date, tz: string) {
  const pa = fmtParts(a, tz);
  const pb = fmtParts(b, tz);
  return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
}
function isTomorrow(now: Date, target: Date, tz: string) {
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  return isSameLocalDay(tomorrow, target, tz);
}