import { describe, it, expect } from "vitest";
import { estimatePlanDurationMs } from "../eta";
import type { PlanStep } from "../interfaces";

const s = (group: number): PlanStep => ({
  capability: "c", providers: ["p"], fields_target: [], parallel_group: group,
  estimated_cost: 0, required: false,
});

describe("estimatePlanDurationMs", () => {
  it("um step por grupo = timeout * (1+retries) por grupo", () => {
    const eta = estimatePlanDurationMs([s(0), s(1)], { timeout_ms_per_step: 1000, avg_retries: 0, max_parallel: 3 });
    expect(eta).toBe(2000);
  });
  it("grupo paralelo dentro da concorrência = 1 wave", () => {
    const eta = estimatePlanDurationMs([s(0), s(0), s(0)], { timeout_ms_per_step: 1000, avg_retries: 0, max_parallel: 3 });
    expect(eta).toBe(1000);
  });
  it("grupo excedendo concorrência = múltiplas waves", () => {
    const eta = estimatePlanDurationMs([s(0), s(0), s(0), s(0)], { timeout_ms_per_step: 1000, avg_retries: 0, max_parallel: 2 });
    expect(eta).toBe(2000);
  });
  it("lista vazia = 0", () => {
    expect(estimatePlanDurationMs([], { timeout_ms_per_step: 1000 })).toBe(0);
  });
});