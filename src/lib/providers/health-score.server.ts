// Health score 0-100 por provider/organização.
// Baseado em janela recente de provider_usage_events.
// Cache in-memory por 60s para evitar hits repetidos.

interface HealthSnapshot {
  score: number;
  avgLatencyMs: number;
  successRate: number;
  samples: number;
  computedAt: number;
}

const CACHE = new Map<string, HealthSnapshot>();
const TTL_MS = 60_000;
const WINDOW_MS = 30 * 60_000;

function keyOf(orgId: string, provider: string) {
  return `${orgId}::${provider}`;
}

export async function computeHealth(
  organizationId: string,
  provider: string,
): Promise<HealthSnapshot> {
  const k = keyOf(organizationId, provider);
  const cached = CACHE.get(k);
  if (cached && Date.now() - cached.computedAt < TTL_MS) return cached;

  let snapshot: HealthSnapshot = {
    score: 80,
    avgLatencyMs: 0,
    successRate: 1,
    samples: 0,
    computedAt: Date.now(),
  };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data } = await supabaseAdmin
      .from("provider_usage_events")
      .select("success, skipped_reason, metadata, created_at")
      .eq("organization_id", organizationId)
      .eq("provider", provider)
      .gte("created_at", since)
      .limit(200);

    const rows = (data ?? []) as Array<any>;
    if (rows.length) {
      const total = rows.length;
      const ok = rows.filter((r) => r.success).length;
      const successRate = ok / total;
      const latencies = rows
        .map((r) => Number(r.metadata?.duration_ms ?? r.metadata?.latency_ms ?? 0))
        .filter((n) => n > 0);
      const avg = latencies.length
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

      const rateLimit = rows.filter((r) => r.skipped_reason === "rate_limit").length;
      const timeouts = rows.filter((r) =>
        String(r.metadata?.error_code ?? r.metadata?.error ?? "")
          .toLowerCase()
          .includes("timeout"),
      ).length;
      const balance = rows.filter(
        (r) => r.skipped_reason === "daily_limit" || r.skipped_reason === "monthly_limit",
      ).length;

      let score = successRate * 100;
      if (avg > 5000) score -= 10;
      if (avg > 10_000) score -= 15;
      score -= Math.min(20, rateLimit * 5);
      score -= Math.min(20, timeouts * 5);
      score -= Math.min(30, balance * 10);

      snapshot = {
        score: Math.max(0, Math.min(100, Math.round(score))),
        avgLatencyMs: Math.round(avg),
        successRate,
        samples: total,
        computedAt: Date.now(),
      };
    }
  } catch {
    // best effort
  }

  CACHE.set(k, snapshot);
  return snapshot;
}

export function __resetHealthCache() {
  CACHE.clear();
}