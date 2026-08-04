import { describe, it, expect, vi, beforeEach } from "vitest";

// Curto-circuita cache/budget/health para focar no fluxo de failover
vi.mock("@/lib/jcs-data-engine/cache.server", () => ({
  checkBudget: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../health-score.server", () => ({
  computeHealth: vi.fn(async () => ({
    score: 80, avgLatencyMs: 100, successRate: 1, samples: 0, computedAt: Date.now(),
  })),
  __resetHealthCache: () => {},
}));

// Mock runtime-config para controlar candidatos
vi.mock("../runtime-config.server", () => ({
  getProviderRuntimeConfig: vi.fn(async ({ provider }: any) => ({
    provider,
    organizationId: "org",
    apiKey: "k",
    baseUrl: "https://x",
    credentialSource: "organization",
    timeoutMs: null,
    priority: provider === "kipflow" ? 1 : provider === "casa_dos_dados" ? 2 : 3,
    dailyLimit: null,
    monthlyLimit: null,
    enabled: true,
    status: null,
  })),
  logProviderUsage: vi.fn(async () => {}),
}));

import { runWithFailover } from "../failover-executor.server";
import { __resetHealthCache } from "../health-score.server";

describe("runWithFailover", () => {
  beforeEach(() => __resetHealthCache());

  it("primeiro provider OK — retorna e não chama próximos", async () => {
    const exec = vi.fn(async (c: any) => (c.provider === "kipflow" ? [{ x: 1 }] : null));
    const r = await runWithFailover<any[]>({
      organizationId: "org",
      capability: "company_search",
      operation: "search",
      exec,
    });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("kipflow");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("primeiro 403 → segundo OK", async () => {
    const exec = vi.fn(async (c: any) => {
      if (c.provider === "kipflow") {
        const e: any = new Error("forbidden"); e.status = 403; throw e;
      }
      return [{ ok: true }];
    });
    const r = await runWithFailover<any[]>({
      organizationId: "org",
      capability: "company_search",
      operation: "search",
      exec,
    });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("casa_dos_dados");
    expect(r.chain[0]).toMatchObject({ provider: "kipflow", ok: false, category: "invalid_permission" });
  });

  it("400 aborta cadeia (erro de usuário)", async () => {
    const exec = vi.fn(async () => {
      const e: any = new Error("bad"); e.status = 400; throw e;
    });
    const r = await runWithFailover<any>({
      organizationId: "org",
      capability: "company_search",
      operation: "search",
      exec,
    });
    expect(r.ok).toBe(false);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("todos falham — retorna reasonByProvider", async () => {
    const exec = vi.fn(async () => {
      const e: any = new Error("rate"); e.status = 429; throw e;
    });
    const r = await runWithFailover<any>({
      organizationId: "org",
      capability: "company_search",
      operation: "search",
      exec,
    });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.reasonByProvider).length).toBeGreaterThan(0);
    expect(r.chain.every((c) => !c.ok)).toBe(true);
  });

  it("resultado vazio com treatEmptyAsFailure tenta próximo", async () => {
    const exec = vi.fn(async (c: any) => (c.provider === "apify" ? [{ y: 2 }] : []));
    const r = await runWithFailover<any[]>({
      organizationId: "org",
      capability: "company_search",
      operation: "search",
      exec,
      treatEmptyAsFailure: true,
    });
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("apify");
  });
});