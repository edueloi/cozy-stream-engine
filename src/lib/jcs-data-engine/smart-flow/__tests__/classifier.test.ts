import { describe, it, expect } from "vitest";
import {
  classifyPreliminary,
  shouldEnrich,
  shouldFetchDecisionMakers,
  nextFlowStatusAfterPreScore,
} from "../classifier";

describe("classifier — thresholds", () => {
  it(">= 80 = promissor", () => {
    expect(classifyPreliminary({ score: 80 })).toBe("promissor");
    expect(classifyPreliminary({ score: 95 })).toBe("promissor");
  });
  it("60..79 = potencial", () => {
    expect(classifyPreliminary({ score: 79 })).toBe("potencial");
    expect(classifyPreliminary({ score: 60 })).toBe("potencial");
  });
  it("40..59 = frio", () => {
    expect(classifyPreliminary({ score: 59 })).toBe("frio");
    expect(classifyPreliminary({ score: 40 })).toBe("frio");
  });
  it("< 40 = descartado", () => {
    expect(classifyPreliminary({ score: 39 })).toBe("descartado");
    expect(classifyPreliminary({ score: 0 })).toBe("descartado");
  });
  it("desqualificador sempre descarta", () => {
    expect(classifyPreliminary({ score: 100, disqualifying: ["mei"] })).toBe("descartado");
  });
});

describe("classifier — enrichment gate", () => {
  it("promissor e potencial enriquecem", () => {
    expect(shouldEnrich("promissor")).toBe(true);
    expect(shouldEnrich("potencial")).toBe(true);
  });
  it("frio e descartado NÃO enriquecem", () => {
    expect(shouldEnrich("frio")).toBe(false);
    expect(shouldEnrich("descartado")).toBe(false);
  });
});

describe("classifier — decision makers gate", () => {
  it("promissor sempre busca decisor", () => {
    expect(shouldFetchDecisionMakers(0, "promissor")).toBe(true);
  });
  it("potencial só busca se score final >= 80", () => {
    expect(shouldFetchDecisionMakers(80, "potencial")).toBe(true);
    expect(shouldFetchDecisionMakers(79, "potencial")).toBe(false);
  });
  it("frio nunca busca", () => {
    expect(shouldFetchDecisionMakers(100, "frio")).toBe(false);
  });
  it("descartado nunca busca", () => {
    expect(shouldFetchDecisionMakers(100, "descartado")).toBe(false);
  });
});

describe("classifier — next flow status", () => {
  it("descartado → descartado_pelo_icp", () => {
    expect(nextFlowStatusAfterPreScore("descartado")).toBe("descartado_pelo_icp");
  });
  it("frio → pre_score_concluido (não enriquece)", () => {
    expect(nextFlowStatusAfterPreScore("frio")).toBe("pre_score_concluido");
  });
  it("potencial/promissor → aguardando_enriquecimento", () => {
    expect(nextFlowStatusAfterPreScore("potencial")).toBe("aguardando_enriquecimento");
    expect(nextFlowStatusAfterPreScore("promissor")).toBe("aguardando_enriquecimento");
  });
});
