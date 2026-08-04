import type { PlanStep } from "./interfaces";

export function estimatePlanDurationMs(
  steps: PlanStep[],
  opts: { timeout_ms_per_step: number; avg_retries?: number; max_parallel?: number },
): number {
  if (!steps.length) return 0;
  const perStep = opts.timeout_ms_per_step * (1 + (opts.avg_retries ?? 0.3));
  const parallel = Math.max(1, opts.max_parallel ?? 3);
  const groups = new Map<number, number>();
  for (const s of steps) groups.set(s.parallel_group, (groups.get(s.parallel_group) ?? 0) + 1);
  let total = 0;
  for (const count of groups.values()) {
    const waves = Math.ceil(count / parallel);
    total += waves * perStep;
  }
  return Math.round(total);
}