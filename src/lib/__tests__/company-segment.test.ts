import { describe, it, expect } from "vitest";
import {
  normalizeCompanySegment,
  looksLikeCnaeCode,
  labelForCnae,
} from "../company-segment";

describe("looksLikeCnaeCode", () => {
  it("números puros com 5-7 dígitos são CNAE", () => {
    expect(looksLikeCnaeCode("6911701")).toBe(true);
    expect(looksLikeCnaeCode("6920601")).toBe(true);
    expect(looksLikeCnaeCode("6911-7/01")).toBe(true);
  });
  it("descrições comerciais não são CNAE", () => {
    expect(looksLikeCnaeCode("Advocacia")).toBe(false);
    expect(looksLikeCnaeCode("Contabilidade")).toBe(false);
  });
  it("vazio/curto não é CNAE", () => {
    expect(looksLikeCnaeCode("")).toBe(false);
    expect(looksLikeCnaeCode("123")).toBe(false);
  });
});

describe("labelForCnae", () => {
  it("mapeia códigos conhecidos", () => {
    expect(labelForCnae("6911701")).toMatch(/Advocacia/i);
    expect(labelForCnae("6920601")).toMatch(/Contabilidade/i);
  });
  it("desconhecido → null", () => {
    expect(labelForCnae("9999999")).toBe(null);
  });
});

describe("normalizeCompanySegment", () => {
  it("CNAE numérico no campo segment é descartado; usa mapeamento", () => {
    const r = normalizeCompanySegment({ segment: "6911701", cnae: "6911701" });
    expect(r.segment).toMatch(/Advocacia/i);
    expect(r.cnae).toBe("6911701");
  });
  it("CNAE 6920601 vira Contabilidade", () => {
    const r = normalizeCompanySegment({ segment: null, cnae: "6920601" });
    expect(r.segment).toMatch(/Contabilidade/i);
  });
  it("Segmento textual real é preservado", () => {
    const r = normalizeCompanySegment({
      segment: "Advocacia empresarial",
      cnae: "6911701",
    });
    expect(r.segment).toBe("Advocacia empresarial");
  });
  it("CNAE preservado mesmo quando formatado", () => {
    const r = normalizeCompanySegment({ cnae: "6911-7/01", segment: null });
    expect(r.cnae).toBe("6911701");
  });
  it("Sem mapeamento → usa cnaeDescription como fallback", () => {
    const r = normalizeCompanySegment({
      segment: null,
      cnae: "9999999",
      cnaeDescription: "Serviço genérico",
    });
    expect(r.segment).toBe("Serviço genérico");
  });
  it("Nunca deixa código no campo segment", () => {
    const r = normalizeCompanySegment({ segment: "4930202" });
    expect(r.segment).not.toBe("4930202");
  });
});