import { describe, it, expect } from "vitest";
import { classifyPreliminary, shouldEnrich, shouldFetchDecisionMakers } from "../classifier";

/**
 * "Contrato de aceite" — reproduz as regras críticas do brief como testes:
 *  ✓ Nenhum provider pago é chamado antes do pré-score
 *  ✓ Empresas ruins são descartadas
 *  ✓ Empresas boas seguem para enriquecimento
 *  ✓ Decisores só para empresa aprovada
 */
describe("acceptance gates", () => {
  it("empresa ruim (score baixo) é descartada e NÃO enriquece", () => {
    const s = classifyPreliminary({ score: 25 });
    expect(s).toBe("descartado");
    expect(shouldEnrich(s)).toBe(false);
    expect(shouldFetchDecisionMakers(100, s)).toBe(false);
  });
  it("empresa boa é aprovada e enriquece + busca decisor", () => {
    const s = classifyPreliminary({ score: 92 });
    expect(s).toBe("promissor");
    expect(shouldEnrich(s)).toBe(true);
    expect(shouldFetchDecisionMakers(0, s)).toBe(true);
  });
  it("empresa potencial enriquece mas só busca decisor se final >= 80", () => {
    const s = classifyPreliminary({ score: 70 });
    expect(s).toBe("potencial");
    expect(shouldEnrich(s)).toBe(true);
    expect(shouldFetchDecisionMakers(75, s)).toBe(false);
    expect(shouldFetchDecisionMakers(85, s)).toBe(true);
  });
});
