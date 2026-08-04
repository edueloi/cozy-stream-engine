import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const POSITIVE = new Set(["interessado", "agendar", "pediu_info"]);
const NEGATIVE = new Set(["objecao", "desinteresse"]);

export const getAdvancedAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const since14 = new Date(Date.now() - 14 * 86400_000).toISOString();

    const [
      { data: leadsRows },
      { data: msgRows },
    ] = await Promise.all([
      context.supabase
        .from("leads")
        .select("id, status, segmento, opt_out, ai_paused, qual_score, created_at"),
      context.supabase
        .from("messages")
        .select("id, lead_id, direction, channel, cadence_day, intent, created_at, status")
        .gte("created_at", since),
    ]);

    const leads = leadsRows ?? [];
    const msgs = msgRows ?? [];

    // ---- Funnel
    const funnel = {
      coletado: 0,
      em_cadencia: 0,
      qualificado: 0,
      reuniao: 0,
      convertido: 0,
      descartado: 0,
    } as Record<string, number>;
    for (const l of leads) {
      const s = l.status ?? "coletado";
      if (s in funnel) funnel[s]++;
    }

    // ---- Daily volume (14d)
    const daily: Record<string, { date: string; out: number; in: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      daily[d] = { date: d, out: 0, in: 0 };
    }
    for (const m of msgs) {
      if (m.created_at < since14) continue;
      const d = m.created_at.slice(0, 10);
      if (!daily[d]) continue;
      if (m.direction === "outbound") daily[d].out++;
      else daily[d].in++;
    }

    // ---- Reply rate / positive reply rate per cadence_day
    const byDay: Record<number, { day: number; out: number; replies: number; positive: number; negative: number }> = {};
    for (const m of msgs) {
      const d = m.cadence_day ?? 0;
      if (!byDay[d]) byDay[d] = { day: d, out: 0, replies: 0, positive: 0, negative: 0 };
      if (m.direction === "outbound") byDay[d].out++;
    }
    // Replies attributed to the last outbound cadence_day per lead
    const lastOutDayByLead = new Map<string, number>();
    const orderedOut = msgs
      .filter((m) => m.direction === "outbound")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const m of orderedOut) lastOutDayByLead.set(m.lead_id, m.cadence_day ?? 0);
    for (const m of msgs) {
      if (m.direction !== "inbound") continue;
      const d = lastOutDayByLead.get(m.lead_id) ?? 0;
      if (!byDay[d]) byDay[d] = { day: d, out: 0, replies: 0, positive: 0, negative: 0 };
      byDay[d].replies++;
      if (m.intent && POSITIVE.has(m.intent)) byDay[d].positive++;
      if (m.intent && NEGATIVE.has(m.intent)) byDay[d].negative++;
    }
    const cadencePerf = Object.values(byDay)
      .sort((a, b) => a.day - b.day)
      .map((r) => ({
        ...r,
        replyRate: r.out ? Math.round((r.replies / r.out) * 100) : 0,
        positiveRate: r.replies ? Math.round((r.positive / r.replies) * 100) : 0,
      }));

    // ---- Avg first response time (minutes): from first outbound to first inbound per lead
    const firstOut = new Map<string, string>();
    const firstIn = new Map<string, string>();
    for (const m of msgs) {
      if (m.direction === "outbound") {
        const prev = firstOut.get(m.lead_id);
        if (!prev || m.created_at < prev) firstOut.set(m.lead_id, m.created_at);
      } else {
        const prev = firstIn.get(m.lead_id);
        if (!prev || m.created_at < prev) firstIn.set(m.lead_id, m.created_at);
      }
    }
    const deltas: number[] = [];
    for (const [leadId, outAt] of firstOut) {
      const inAt = firstIn.get(leadId);
      if (!inAt || inAt < outAt) continue;
      deltas.push((new Date(inAt).getTime() - new Date(outAt).getTime()) / 60000);
    }
    const avgFirstResponseMin = deltas.length
      ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
      : 0;

    // ---- Aggregate reply rate (30d)
    const totalOut = msgs.filter((m) => m.direction === "outbound").length;
    const totalIn = msgs.filter((m) => m.direction === "inbound").length;
    const totalPositive = msgs.filter(
      (m) => m.direction === "inbound" && m.intent && POSITIVE.has(m.intent),
    ).length;

    // ---- Compliance
    const optOuts = leads.filter((l) => l.opt_out).length;
    const paused = leads.filter((l) => l.ai_paused).length;

    return {
      funnel,
      daily: Object.values(daily),
      cadencePerf,
      totals: {
        leads: leads.length,
        outbound30: totalOut,
        inbound30: totalIn,
        replyRate: totalOut ? Math.round((totalIn / totalOut) * 100) : 0,
        positiveRate: totalIn ? Math.round((totalPositive / totalIn) * 100) : 0,
        avgFirstResponseMin,
        optOuts,
        paused,
      },
    };
  });