import type { OrchestratorStrategy } from "./interfaces";

export interface ProviderScore {
  provider: string;
  capability: string;
  cost: number;
  quality: number;
  priority: number;
  success_rate: number;
  enabled: boolean;
  budget_ok: boolean;
}

export function orderProviders(
  strategy: OrchestratorStrategy,
  candidates: ProviderScore[],
): ProviderScore[] {
  const pool = candidates.filter((c) => c.enabled && c.budget_ok);
  const sorters: Record<OrchestratorStrategy, (a: ProviderScore, b: ProviderScore) => number> = {
    CheapestFirst: (a, b) => a.cost - b.cost || b.success_rate - a.success_rate,
    HighestQualityFirst: (a, b) => b.quality - a.quality || a.cost - b.cost,
    PriorityOrder: (a, b) => a.priority - b.priority || a.cost - b.cost,
    Balanced: (a, b) => {
      const sa = a.quality * 0.5 + a.success_rate * 30 - a.cost * 0.5;
      const sb = b.quality * 0.5 + b.success_rate * 30 - b.cost * 0.5;
      return sb - sa;
    },
  };
  return [...pool].sort(sorters[strategy] ?? sorters.Balanced);
}