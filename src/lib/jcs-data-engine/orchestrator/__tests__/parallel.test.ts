import { describe, it, expect } from "vitest";
import { runParallel } from "../parallel.server";

describe("runParallel", () => {
  it("respeita concorrência máxima", async () => {
    let inflight = 0, peak = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runParallel(items, async () => {
      inflight++; peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 10));
      inflight--; return 1;
    }, 3);
    expect(peak).toBeLessThanOrEqual(3);
  });
  it("preserva ordem", async () => {
    const out = await runParallel([1, 2, 3, 4], async (i) => i * 2, 2);
    expect(out).toEqual([2, 4, 6, 8]);
  });
});