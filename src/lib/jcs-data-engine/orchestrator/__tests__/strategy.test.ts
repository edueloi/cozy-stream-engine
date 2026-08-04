import { describe, it, expect } from "vitest";
import { orderProviders, type ProviderScore } from "../strategy.server";

const mk = (o: Partial<ProviderScore>): ProviderScore => ({
  provider: "p", capability: "c", cost: 1, quality: 50, priority: 100,
  success_rate: 0.9, enabled: true, budget_ok: true, ...o,
});

describe("orderProviders", () => {
  const list = [
    mk({ provider: "cheap", cost: 1, quality: 40 }),
    mk({ provider: "expensive", cost: 10, quality: 90 }),
    mk({ provider: "mid", cost: 5, quality: 70, priority: 1 }),
  ];
  it("CheapestFirst", () => {
    expect(orderProviders("CheapestFirst", list)[0].provider).toBe("cheap");
  });
  it("HighestQualityFirst", () => {
    expect(orderProviders("HighestQualityFirst", list)[0].provider).toBe("expensive");
  });
  it("PriorityOrder", () => {
    expect(orderProviders("PriorityOrder", list)[0].provider).toBe("mid");
  });
  it("Balanced escolhe pelo score", () => {
    const r = orderProviders("Balanced", list);
    expect(r[0].provider).toBeDefined();
  });
  it("filtra desabilitados / sem budget", () => {
    const r = orderProviders("Balanced", [mk({ enabled: false }), mk({ budget_ok: false }), mk({ provider: "ok" })]);
    expect(r).toHaveLength(1);
    expect(r[0].provider).toBe("ok");
  });
});