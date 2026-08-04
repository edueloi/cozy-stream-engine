import { describe, it, expect, vi } from "vitest";
import { executeCompanySearchWithFailover } from "../company-search-failover.server";
import type { FailoverResult } from "@/lib/providers/failover-executor.server";

function fakeCandidate(provider: string) {
  return {
    provider,
    config: {
      provider,
      organizationId: "org",
      apiKey: "k",
      baseUrl: null,
      credentialSource: "organization",
      timeoutMs: null,
      priority: 1,
      dailyLimit: null,
      monthlyLimit: null,
      enabled: true,
      status: null,
    },
    priority: 1,
    health: 100,
    avgLatencyMs: 100,
    eligible: true,
  } as any;
}

function fakeExecutor(
  order: string[],
  execImpl: (p: string) => Promise<any[]> | any[],
): any {
  return async (opts: any): Promise<FailoverResult<any>> => {
    const chain: any[] = [];
    const reasonByProvider: Record<string, string> = {};
    for (const p of order) {
      try {
        const data = await execImpl(p);
        if (data && (!opts.treatEmptyAsFailure || data.length > 0)) {
          chain.push({ provider: p, ok: true, durationMs: 1 });
          return { ok: true, data, provider: p, chain, reasonByProvider };
        }
        chain.push({ provider: p, ok: false, durationMs: 1, reason: "empty_result" });
        reasonByProvider[p] = "empty_result";
      } catch (e: any) {
        const cat = e?.category ?? (e?.status === 402 ? "insufficient_balance" : "unknown");
        chain.push({ provider: p, ok: false, durationMs: 1, category: cat, reason: cat });
        reasonByProvider[p] = cat;
        if (cat === "user_error") return { ok: false, data: null, provider: null, chain, reasonByProvider };
      }
    }
    return { ok: false, data: null, provider: null, chain, reasonByProvider };
  };
}

describe("executeCompanySearchWithFailover", () => {
  it("Kipflow sem CNPJ vira unsupported_capability e não é tentada", async () => {
    const exec = vi.fn(async (c: any) => {
      // Simula executor real invocando exec com Kipflow
      const p = c.provider;
      if (p === "kipflow") {
        const err: any = new Error("unsupported"); err.category = "unsupported_capability";
        throw err;
      }
      return [{ company_name: "ACME", cnpj: "1", discovery_source: p } as any];
    });
    // Reproduz o loop de failover: kipflow → casa_dos_dados
    const runner = async (): Promise<any> => {
      const chain: any[] = [];
      for (const p of ["kipflow", "casa_dos_dados"]) {
        try {
          const data = await exec(fakeCandidate(p));
          chain.push({ provider: p, ok: true, durationMs: 1 });
          return { ok: true, data, provider: p, chain, reasonByProvider: {} };
        } catch (e: any) {
          chain.push({ provider: p, ok: false, durationMs: 1, category: e.category });
        }
      }
      return { ok: false, data: null, provider: null, chain, reasonByProvider: {} };
    };
    const out = await executeCompanySearchWithFailover({
      organizationId: "org",
      filters: { cidade: "SP" },
      __runWithFailover: runner as any,
      __execOverride: (async () => null) as any,
    });
    // O __runWithFailover injetado usa seu próprio exec; validamos que
    // ele encerrou usando casa_dos_dados após kipflow falhar.
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("casa_dos_dados");
  });

  it("Casa dos Dados 403 sem saldo → Apify assume", async () => {
    const run = fakeExecutor(["kipflow", "casa_dos_dados", "apify"], (p) => {
      if (p === "kipflow") { const e: any = new Error("no cnpj"); e.category = "unsupported_capability"; throw e; }
      if (p === "casa_dos_dados") { const e: any = new Error("sem saldo"); e.status = 402; throw e; }
      return [{ company_name: "X", discovery_source: "apify" } as any];
    });
    const out = await executeCompanySearchWithFailover({
      organizationId: "org",
      filters: { cidade: "SP" },
      __runWithFailover: run,
      __execOverride: (async () => null) as any,
    });
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("apify");
    expect(out.reasonByProvider.casa_dos_dados).toBe("insufficient_balance");
  });

  it("Todos falham → mensagem amigável, sem citar provider", async () => {
    const run = fakeExecutor(["kipflow", "casa_dos_dados", "apify"], () => {
      const e: any = new Error("boom"); e.status = 500; throw e;
    });
    const out = await executeCompanySearchWithFailover({
      organizationId: "org",
      filters: { cidade: "SP" },
      __runWithFailover: run,
      __execOverride: (async () => null) as any,
    });
    expect(out.ok).toBe(false);
    expect(out.userMessage).toMatch(/nenhuma fonte de dados/i);
    expect(out.userMessage).not.toMatch(/casa dos dados|kipflow|apify/i);
  });

  it("Deduplicação por CNPJ mantém uma única empresa", async () => {
    const run = fakeExecutor(["kipflow"], () => [
      { company_name: "A", cnpj: "12345678000199", discovery_source: "kipflow" } as any,
      { company_name: "A dup", cnpj: "12.345.678/0001-99", discovery_source: "kipflow", phone: "11" } as any,
    ]);
    const out = await executeCompanySearchWithFailover({
      organizationId: "org",
      filters: { cnpj: "12345678000199" },
      __runWithFailover: run,
      __execOverride: (async () => null) as any,
    });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].phone).toBe("11"); // merge preencheu campo ausente
  });

  it("Primeiro provider OK — não tenta os próximos", async () => {
    const calls: string[] = [];
    const run = fakeExecutor(["kipflow", "casa_dos_dados"], (p) => {
      calls.push(p);
      return [{ company_name: "OK", discovery_source: p } as any];
    });
    const out = await executeCompanySearchWithFailover({
      organizationId: "org",
      filters: { cnpj: "1" },
      __runWithFailover: run,
      __execOverride: (async () => null) as any,
    });
    expect(out.ok).toBe(true);
    expect(calls).toEqual(["kipflow"]);
  });

  it("Erro de usuário (400) aborta cadeia sem failover", async () => {
    const run = fakeExecutor(["kipflow", "casa_dos_dados"], () => {
      const e: any = new Error("bad"); e.category = "user_error"; throw e;
    });
    const out = await executeCompanySearchWithFailover({
      organizationId: "org",
      filters: {},
      __runWithFailover: run,
      __execOverride: (async () => null) as any,
    });
    expect(out.ok).toBe(false);
  });
});