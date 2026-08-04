import { describe, it, expect } from "vitest";
import {
  classifyMeetingLifecycle,
  buildReminderText,
  buildNoShowText,
  type MeetingRow,
} from "../meetings-lifecycle";

const iso = (offsetMs: number, base = Date.now()) => new Date(base + offsetMs).toISOString();

function m(over: Partial<MeetingRow>, now = new Date()): MeetingRow {
  const start = over.start_at ?? iso(24 * 3600 * 1000, now.getTime());
  const end = over.end_at ?? new Date(new Date(start).getTime() + 30 * 60000).toISOString();
  return {
    id: "m1",
    status: "scheduled",
    start_at: start,
    end_at: end,
    ...over,
  };
}

describe("classifyMeetingLifecycle", () => {
  const now = new Date("2026-07-23T12:00:00-03:00");

  it("envia lembrete 24h quando falta ~1 dia", () => {
    const startAt = new Date(now.getTime() + 24 * 3600 * 1000);
    const r = classifyMeetingLifecycle(now, m({ start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 30 * 60000).toISOString() }, now), {});
    expect(r.kind).toBe("send_reminder_24h");
  });

  it("nao envia lembrete 24h se ja enviado", () => {
    const startAt = new Date(now.getTime() + 24 * 3600 * 1000);
    const r = classifyMeetingLifecycle(now, m({ start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 30 * 60000).toISOString(), reminder_24h_sent_at: now.toISOString() }, now));
    expect(r.kind).toBe("skip");
  });

  it("envia lembrete 2h quando falta ~1h30", () => {
    const startAt = new Date(now.getTime() + 90 * 60 * 1000);
    const r = classifyMeetingLifecycle(now, m({ start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 30 * 60000).toISOString() }, now));
    expect(r.kind).toBe("send_reminder_2h");
  });

  it("reuniao no passado nao gera lembrete futuro", () => {
    const startAt = new Date(now.getTime() - 7 * 86400000);
    const endAt = new Date(startAt.getTime() + 30 * 60000);
    const r = classifyMeetingLifecycle(now, m({ start_at: startAt.toISOString(), end_at: endAt.toISOString() }, now));
    expect(r.kind).not.toBe("send_reminder_24h");
    expect(r.kind).not.toBe("send_reminder_2h");
  });

  it("end_at recem-passado marca awaiting_outcome", () => {
    const startAt = new Date(now.getTime() - 60 * 60000);
    const endAt = new Date(now.getTime() - 30 * 60000);
    const r = classifyMeetingLifecycle(now, m({ start_at: startAt.toISOString(), end_at: endAt.toISOString(), status: "scheduled" }, now));
    expect(r.kind).toBe("mark_awaiting_outcome");
  });

  it("outcome_overdue depois de 4h sem update", () => {
    const startAt = new Date(now.getTime() - 6 * 3600 * 1000);
    const endAt = new Date(now.getTime() - 5 * 3600 * 1000);
    const r = classifyMeetingLifecycle(now, m({ start_at: startAt.toISOString(), end_at: endAt.toISOString(), status: "awaiting_outcome" }, now));
    expect(r.kind).toBe("mark_outcome_overdue");
  });

  it("status completed nunca dispara acao", () => {
    const r = classifyMeetingLifecycle(now, m({ status: "completed" }, now));
    expect(r.kind).toBe("skip");
  });

  it("status cancelled nunca dispara acao", () => {
    const r = classifyMeetingLifecycle(now, m({ status: "cancelled" }, now));
    expect(r.kind).toBe("skip");
  });

  it("reuniao em andamento nao envia lembrete", () => {
    const startAt = new Date(now.getTime() - 5 * 60000);
    const endAt = new Date(now.getTime() + 25 * 60000);
    const r = classifyMeetingLifecycle(now, m({ start_at: startAt.toISOString(), end_at: endAt.toISOString() }, now));
    expect(r.kind).toBe("skip");
  });
});

describe("buildReminderText", () => {
  it("diz 'hoje' quando reuniao e no mesmo dia", () => {
    const now = new Date("2026-07-23T09:00:00-03:00");
    const startAt = new Date("2026-07-23T14:30:00-03:00");
    const txt = buildReminderText({ now, startAt, kind: "2h", leadName: "Ana", meetingUrl: "https://meet.example/x" });
    expect(txt).toContain("hoje");
    expect(txt).toContain("14:30");
    expect(txt).toContain("Ana");
  });
  it("diz 'amanhã' quando reuniao e no dia seguinte", () => {
    const now = new Date("2026-07-23T09:00:00-03:00");
    const startAt = new Date("2026-07-24T09:00:00-03:00");
    const txt = buildReminderText({ now, startAt, kind: "24h" });
    expect(txt).toContain("amanhã");
    expect(txt).toContain("09:00");
  });
  it("cai para data DD/MM quando falta mais de 1 dia", () => {
    const now = new Date("2026-07-23T09:00:00-03:00");
    const startAt = new Date("2026-07-30T09:00:00-03:00");
    const txt = buildReminderText({ now, startAt, kind: "24h" });
    expect(txt).toContain("30/07");
  });
  it("no-show sugere remarcacao", () => {
    expect(buildNoShowText({ leadName: "João" })).toMatch(/remarcar/i);
  });
});