// Rate limiter in-process por (organization_id, provider).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface RateLimitConfig {
  max_concurrent_requests: number;
  requests_per_minute: number;
  requests_per_hour: number;
  cooldown_after_429_seconds: number;
}

const DEFAULTS: RateLimitConfig = {
  max_concurrent_requests: 3,
  requests_per_minute: 60,
  requests_per_hour: 1000,
  cooldown_after_429_seconds: 30,
};

interface Bucket {
  inflight: number;
  minute: number[];
  hour: number[];
  cooldown_until: number;
  cfg: RateLimitConfig;
}

const buckets = new Map<string, Bucket>();
const keyOf = (org: string, provider: string) => `${org}::${provider}`;

async function loadConfig(org: string, provider: string): Promise<RateLimitConfig> {
  try {
    const { data } = await supabaseAdmin
      .from("provider_budget_limits")
      .select("metadata")
      .eq("organization_id", org)
      .eq("provider", provider)
      .maybeSingle();
    const meta = ((data as any)?.metadata ?? {}) as Record<string, any>;
    return {
      max_concurrent_requests: Number(meta.max_concurrent_requests ?? DEFAULTS.max_concurrent_requests),
      requests_per_minute: Number(meta.requests_per_minute ?? DEFAULTS.requests_per_minute),
      requests_per_hour: Number(meta.requests_per_hour ?? DEFAULTS.requests_per_hour),
      cooldown_after_429_seconds: Number(meta.cooldown_after_429_seconds ?? DEFAULTS.cooldown_after_429_seconds),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

async function getBucket(org: string, provider: string): Promise<Bucket> {
  const k = keyOf(org, provider);
  let b = buckets.get(k);
  if (!b) {
    b = { inflight: 0, minute: [], hour: [], cooldown_until: 0, cfg: await loadConfig(org, provider) };
    buckets.set(k, b);
  }
  return b;
}

function prune(b: Bucket) {
  const now = Date.now();
  b.minute = b.minute.filter((t) => now - t < 60_000);
  b.hour = b.hour.filter((t) => now - t < 3_600_000);
}

export interface AcquireResult {
  ok: boolean;
  wait_ms: number;
  reason?: "cooldown" | "concurrency" | "per_minute" | "per_hour";
}

export async function acquireSlot(params: {
  organization_id: string;
  provider: string;
  max_wait_ms?: number;
}): Promise<AcquireResult> {
  const b = await getBucket(params.organization_id, params.provider);
  const maxWait = params.max_wait_ms ?? 15_000;
  const start = Date.now();
  let waited = 0;
  while (true) {
    prune(b);
    const now = Date.now();
    if (b.cooldown_until > now) {
      const wait = Math.min(1000, b.cooldown_until - now);
      if (Date.now() - start + wait > maxWait) return { ok: false, wait_ms: waited, reason: "cooldown" };
      await sleep(wait); waited += wait; continue;
    }
    if (b.inflight >= b.cfg.max_concurrent_requests) {
      if (Date.now() - start > maxWait) return { ok: false, wait_ms: waited, reason: "concurrency" };
      await sleep(50); waited += 50; continue;
    }
    if (b.minute.length >= b.cfg.requests_per_minute) {
      const wait = Math.min(1000, 60_000 - (now - b.minute[0]));
      if (Date.now() - start + wait > maxWait) return { ok: false, wait_ms: waited, reason: "per_minute" };
      await sleep(wait); waited += wait; continue;
    }
    if (b.hour.length >= b.cfg.requests_per_hour) {
      return { ok: false, wait_ms: waited, reason: "per_hour" };
    }
    b.inflight++; b.minute.push(now); b.hour.push(now);
    return { ok: true, wait_ms: waited };
  }
}

export async function releaseSlot(org: string, provider: string): Promise<void> {
  const b = buckets.get(keyOf(org, provider));
  if (b && b.inflight > 0) b.inflight--;
}

export async function trip429(org: string, provider: string): Promise<void> {
  const b = await getBucket(org, provider);
  b.cooldown_until = Date.now() + b.cfg.cooldown_after_429_seconds * 1000;
}

export function __resetRateLimiter() { buckets.clear(); }

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }