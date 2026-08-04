import { describe, it, expect } from "vitest";
import { aggregate } from "../metrics";

describe("aggregate", () => {
  it("lote vazio devolve zeros", () => {
    const a = aggregate([]);
    expect(a.total_pre_scored).toBe(0);
    expect(a.savings_pct).toBe(0);
  });

  it("contabiliza status e créditos", () => {
    const a = aggregate([
      { preliminary: "promissor", enriched: true, fetched_decision_makers: true, decision_makers_found: 2, credits_spent: 50, credits_avoided: 0, duration_ms: 800 },
      { preliminary: "potencial", enriched: true, fetched_decision_makers: false, decision_makers_found: 0, credits_spent: 30, credits_avoided: 0, duration_ms: 600 },
      { preliminary: "frio",      enriched: false, fetched_decision_makers: false, decision_makers_found: 0, credits_spent: 0,  credits_avoided: 50, duration_ms: 100 },
      { preliminary: "descartado",enriched: false, fetched_decision_makers: false, decision_makers_found: 0, credits_spent: 0,  credits_avoided: 50, duration_ms: 50  },
    ]);
    expect(a.total_pre_scored).toBe(4);
    expect(a.total_promissores).toBe(1);
    expect(a.total_potenciais).toBe(1);
    expect(a.total_frios).toBe(1);
    expect(a.total_descartados_icp).toBe(1);
    expect(a.total_enriched).toBe(2);
    expect(a.total_dm_fetched).toBe(1);
    expect(a.total_dm_found).toBe(2);
    expect(a.credits_spent).toBe(80);
    expect(a.credits_saved).toBe(100);
    // 100 / (100+80) = 55.55 → 56
    expect(a.savings_pct).toBe(56);
    expect(a.avg_processing_ms).toBe(Math.round((800 + 600 + 100 + 50) / 4));
  });

  it("100% economia quando nada é gasto", () => {
    const a = aggregate([
      { preliminary: "frio",      enriched: false, fetched_decision_makers: false, decision_makers_found: 0, credits_spent: 0, credits_avoided: 40, duration_ms: 10 },
      { preliminary: "descartado",enriched: false, fetched_decision_makers: false, decision_makers_found: 0, credits_spent: 0, credits_avoided: 40, duration_ms: 10 },
    ]);
    expect(a.savings_pct).toBe(100);
    expect(a.total_enriched).toBe(0);
  });
});
