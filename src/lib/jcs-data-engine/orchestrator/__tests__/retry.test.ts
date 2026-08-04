import { describe, it, expect, vi } from "vitest";
import { withRetry } from "../retry.server";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("sucesso na primeira tentativa", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const r = await withRetry(fn, { sleep: noSleep });
    expect(r.ok && r.value).toBe(42);
    expect(r.attempts).toBe(1);
  });

  it("retryable + sucesso na 2ª", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++; if (n === 1) throw new Error("network fetch failed");
      return "ok";
    });
    const r = await withRetry(fn, { sleep: noSleep });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
  });

  it("terminal → sem repetição", async () => {
    const fn = vi.fn(async () => { const e: any = new Error("bad"); e.status = 400; throw e; });
    const r = await withRetry(fn, { sleep: noSleep });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.classified.category).toBe("terminal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respeita Retry-After", async () => {
    let n = 0;
    const waits: number[] = [];
    const fn = vi.fn(async () => {
      n++; if (n < 2) { const e: any = new Error("rate"); e.status = 429; e.retry_after = "1"; throw e; }
      return 1;
    });
    const r = await withRetry(fn, { sleep: (ms) => { waits.push(ms); return Promise.resolve(); } });
    expect(r.ok).toBe(true);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
  });

  it("máximo de tentativas retryable = 3", async () => {
    const fn = vi.fn(async () => { throw new Error("fetch failed"); });
    const r = await withRetry(fn, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3);
  });

  it("unknown → até 2 tentativas", async () => {
    const fn = vi.fn(async () => { throw new Error("mystery"); });
    const r = await withRetry(fn, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
  });
});