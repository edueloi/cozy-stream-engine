import { describe, it, expect } from "vitest";
import { validateSearchAgainstIcp, type IcpRuleLite } from "../validate";

// Cenário real do hotfix 1.3.5:
//  ICP "Gestão de TI PME" tem regra required de segmento (ex.: TI/tecnologia)
//  mas o CNAE 6920601 (Contabilidade) é permitido pelo ICP.
//  Antes: bloqueava por "SEGMENTO fora do critério obrigatório".
//  Depois: vira warning porque o CNAE é a classificação técnica principal.

const rulesWithSegRequired: IcpRuleLite[] = [
  { field_key: "segmento", operator: "in", value: ["ti", "tecnologia"], required: true, weight: 10 },
  { field_key: "cnae", operator: "in", value: ["6920601", "6201500"], required: false, weight: 20 },
  { field_key: "cnae", operator: "not_in", value: ["MEI"], disqualifying: true },
];

describe("validate — Segmento vs CNAE (hotfix 1.3.5)", () => {
  it("Segmento incompatível + CNAE compatível → warning, não blocked", () => {
    const r = validateSearchAgainstIcp({
      filters: { segmento: "contabilidade", cnae: ["6920601"], uf: "SP" },
      rules: rulesWithSegRequired,
    });
    expect(r.compatible).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.warnings.some((w) => w.field === "segmento")).toBe(true);
  });

  it("Segmento compatível + CNAE compatível → compatível sem warnings de segmento", () => {
    const r = validateSearchAgainstIcp({
      filters: { segmento: "ti", cnae: ["6201500"] },
      rules: rulesWithSegRequired,
    });
    expect(r.compatible).toBe(true);
    expect(r.matched_filters).toContain("segmento");
  });

  it("CNAE proibido continua bloqueando mesmo com Segmento certo", () => {
    const r = validateSearchAgainstIcp({
      filters: { segmento: "ti", cnae: ["MEI"] },
      rules: rulesWithSegRequired,
    });
    expect(r.compatible).toBe(false);
  });

  it("Segmento divergente sem CNAE preenchido → mantém blocked (não há critério técnico para apoiar)", () => {
    const r = validateSearchAgainstIcp({
      filters: { segmento: "contabilidade" },
      rules: rulesWithSegRequired,
    });
    expect(r.compatible).toBe(false);
    expect(r.blockers.some((b) => b.field === "segmento")).toBe(true);
  });

  it("Segmento vazio + CNAE compatível → não bloqueia (missing_filter warning)", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"] },
      rules: rulesWithSegRequired,
    });
    expect(r.compatible).toBe(true);
  });
});