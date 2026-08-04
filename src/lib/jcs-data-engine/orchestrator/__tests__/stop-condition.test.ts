import { describe, it, expect } from "vitest";
import { shouldStop } from "../stop-condition.server";
import { emptyCompany } from "../../normalizer";

describe("shouldStop", () => {
  const base = { min_quality: 80, required_fields: [], budget_cents: null, spent_cents: 0, feature_flag_ok: true };

  it("feature flag off → stop", () => {
    expect(shouldStop(null, { ...base, feature_flag_ok: false })).toEqual({ stop: true, reason: "feature_flag_off" });
  });
  it("budget exhausted", () => {
    expect(shouldStop(null, { ...base, budget_cents: 100, spent_cents: 100 })).toEqual({ stop: true, reason: "budget_exhausted" });
  });
  it("required field ausente não para", () => {
    const c = { ...emptyCompany("t"), company_name: "ACME", cnpj: "1", website: "x", phone: "1", email: "e", linkedin: "l", segment: "s", city: "c", state: "s", employees: 1, capital: 1 } as any;
    const r = shouldStop(c, { ...base, required_fields: ["missing_field"] });
    expect(r.stop).toBe(false);
  });
  it("qualidade atingida com required ok", () => {
    const c = { ...emptyCompany("t"), company_name: "ACME", cnpj: "1", website: "x", phone: "1", email: "e", linkedin: "l", segment: "s", city: "c", state: "s", employees: 1, capital: 1 } as any;
    const r = shouldStop(c, { ...base, required_fields: ["company_name"] });
    expect(r).toEqual({ stop: true, reason: "quality_reached" });
  });
});