import { describe, it, expect } from "vitest";
import { validateSearchAgainstIcp, type IcpRuleLite } from "../validate";

const rules: IcpRuleLite[] = [
  { field_key: "cnae", operator: "in", value: ["6201500", "6202300"], required: true, weight: 20 },
  { field_key: "cnae", operator: "not_in", value: ["MEI", "4930202"], disqualifying: true, weight: 0 },
  { field_key: "uf", operator: "in", value: ["SP"], required: true, weight: 10 },
  { field_key: "cidade", operator: "in", value: ["Sorocaba", "Boituva"], weight: 5 },
  { field_key: "porte", operator: "in", value: ["PEQUENA", "MEDIA"], weight: 10 },
  { field_key: "situacao_cadastral", operator: "in", value: ["ATIVA"], required: true, weight: 8 },
];

describe("validateSearchAgainstIcp — bloqueios e avisos", () => {
  it("1. CNAE permitido → compatível", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"], uf: "SP", situacao_cadastral: "ATIVA" },
      rules,
    });
    expect(r.compatible).toBe(true);
    expect(r.matched_filters).toContain("cnae");
  });
  it("2. CNAE proibido (not_in disqualifying) → bloqueia", () => {
    const r = validateSearchAgainstIcp({ filters: { cnae: "MEI", uf: "SP" }, rules });
    expect(r.compatible).toBe(false);
    expect(r.blockers.find((b) => b.kind === "forbidden")).toBeTruthy();
  });
  it("3. CNAE desqualificador (4930202) → bloqueia", () => {
    const r = validateSearchAgainstIcp({ filters: { cnae: ["4930202"], uf: "SP" }, rules });
    expect(r.compatible).toBe(false);
  });
  it("4. UF obrigatória compatível → permite", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"], uf: ["SP"], situacao_cadastral: ["ATIVA"] },
      rules,
    });
    expect(r.compatible).toBe(true);
    expect(r.matched_filters).toContain("uf");
  });
  it("5. UF obrigatória incompatível → bloqueia", () => {
    const r = validateSearchAgainstIcp({ filters: { cnae: ["6201500"], uf: "RJ" }, rules });
    expect(r.compatible).toBe(false);
    expect(r.blockers.some((b) => b.field === "uf")).toBe(true);
  });
  it("6. Filtro ausente → warning, não bloqueio", () => {
    const r = validateSearchAgainstIcp({ filters: { cnae: ["6201500"], uf: "SP" }, rules });
    expect(r.compatible).toBe(true);
    expect(r.warnings.some((w) => w.kind === "missing_filter")).toBe(true);
  });
  it("7. Campo desconhecido → warning unknown_field", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"], uf: "SP", situacao_cadastral: "ATIVA", foo: "bar" } as any,
      rules,
    });
    expect(r.warnings.some((w) => w.kind === "unknown_field")).toBe(true);
  });
  it("8. Filtros vazios → não bloqueia mas gera warnings de faltantes", () => {
    const r = validateSearchAgainstIcp({ filters: {}, rules });
    expect(r.compatible).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("9. estimated_preliminary_fit entre 0 e 100", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"], uf: "SP", cidade: "Sorocaba", porte: "PEQUENA", situacao_cadastral: "ATIVA" },
      rules,
    });
    expect(r.estimated_preliminary_fit).toBeGreaterThan(0);
    expect(r.estimated_preliminary_fit).toBeLessThanOrEqual(100);
  });
  it("10. Cidade proibida via not_in disqualifying bloqueia", () => {
    const rr: IcpRuleLite[] = [
      { field_key: "cidade", operator: "not_in", value: ["Campinas"], disqualifying: true },
    ];
    const r = validateSearchAgainstIcp({ filters: { cidade: "Campinas" }, rules: rr });
    expect(r.compatible).toBe(false);
  });
  it("11. Porte fora do required=false não bloqueia", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"], uf: "SP", situacao_cadastral: "ATIVA", porte: "MEI" },
      rules,
    });
    expect(r.compatible).toBe(true);
  });
  it("12. Sem regras → sempre compatível", () => {
    const r = validateSearchAgainstIcp({ filters: { cnae: "any" }, rules: [] });
    expect(r.compatible).toBe(true);
  });
  it("13. Rules null / filters null → compatível sem crash", () => {
    const r = validateSearchAgainstIcp({ filters: null, rules: null });
    expect(r.compatible).toBe(true);
  });
  it("14. Situação cadastral obrigatória fora da lista bloqueia", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"], uf: "SP", situacao_cadastral: "SUSPENSA" },
      rules,
    });
    expect(r.compatible).toBe(false);
    expect(r.blockers.some((b) => b.field === "situacao_cadastral")).toBe(true);
  });
  it("15. Case-insensitive nas comparações de string", () => {
    const r = validateSearchAgainstIcp({
      filters: { cnae: ["6201500"], uf: "sp", situacao_cadastral: "ativa" },
      rules,
    });
    expect(r.compatible).toBe(true);
  });
});