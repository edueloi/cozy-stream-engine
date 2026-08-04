import type { NormalizedCompany } from "../normalizer";
import { computeDataQualityScore } from "../normalizer";

export interface StopContext {
  min_quality: number;
  required_fields: string[];
  budget_cents: number | null;
  spent_cents: number;
  feature_flag_ok: boolean;
}

export function shouldStop(
  company: NormalizedCompany | null,
  ctx: StopContext,
): { stop: boolean; reason?: string } {
  if (!ctx.feature_flag_ok) return { stop: true, reason: "feature_flag_off" };
  if (ctx.budget_cents != null && ctx.spent_cents >= ctx.budget_cents) {
    return { stop: true, reason: "budget_exhausted" };
  }
  if (!company) return { stop: false };
  const q = computeDataQualityScore(company);
  if (q >= ctx.min_quality) {
    const missing = ctx.required_fields.filter(
      (f) => (company as any)[f] == null || (company as any)[f] === "",
    );
    if (missing.length === 0) return { stop: true, reason: "quality_reached" };
  }
  return { stop: false };
}