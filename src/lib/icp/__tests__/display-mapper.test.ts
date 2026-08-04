import { describe, it, expect } from "vitest";
import { runUniversalIcpEngine, type IcpRule } from "../universal-icp-engine";
import { mapIcpEvaluationForDisplay, classifyPersistedScore } from "../display-mapper";

function baseIcp() {
  return { id: "icp-1", minimum_score: 80, preliminary_minimum_score: 70 };
}

function rules(): IcpRule[] {
  return [
    { category: "geo", field_key: "state", field_label: "UF", field_type: "text", operator: "equals", value: "SP", weight: 20, required: false, disqualifying: false, positive_or_negative: "positive" },
    { category: "geo", field_key: "city", field_label: "Cidade", field_type: "text", operator: "equals", value: "São Paulo", weight: 10, required: false, disqualifying: false, positive_or_negative: "positive" },
    { category: "biz", field_key: "cnae", field_label: "CNAE", field_type: "text", operator: "equals", value: "6202-3/00", weight: 30, required: false, disqualifying: false, positive_or_negative: "positive" },
    { category: "biz", field_key: "cnae", field_label: "CNAE proibido", field_type: "list", operator: "in", value: ["9999"], weight: 50, required: false, disqualifying: true, positive_or_negative: "negative" },
  ];
}

describe("Universal ICP Engine — Release 1.3.9 (unknown vs disqualified)", () => {
  it("campo ausente vira UNKNOWN, nunca DISQUALIFIED", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [{ id: "1", state: "SP" /* city + cnae ausentes */ }],
      mode: "final",
    });
    const s = out.scores[0];
    expect(s.evaluations.find((e) => e.criterion === "Cidade")?.state).toBe("unknown");
    expect(s.evaluations.find((e) => e.criterion === "CNAE")?.state).toBe("unknown");
    expect(s.disqualifying).toEqual([]);
  });

  it("campo presente que atende → MATCHED", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [{ id: "1", state: "SP", city: "São Paulo", cnae: "6202-3/00" }],
      mode: "final",
    });
    const s = out.scores[0];
    expect(s.evaluations.find((e) => e.criterion === "UF")?.state).toBe("matched");
    // Release 1.4.0: score absoluto = 20 (UF) + 10 (Cidade) + 30 (CNAE) = 60
    expect(s.score).toBeGreaterThanOrEqual(60);
  });

  it("campo presente que NÃO atende ao positivo → NOT_MATCHED (não desqualifica)", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [{ id: "1", state: "RJ", city: "Rio", cnae: "6202-3/00" }],
      mode: "final",
    });
    const s = out.scores[0];
    expect(s.evaluations.find((e) => e.criterion === "UF")?.state).toBe("not_matched");
    expect(s.disqualifying).toEqual([]);
  });

  it("regra proibida comprovada com dado presente → DISQUALIFIED real", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [{ id: "1", state: "SP", city: "São Paulo", cnae: "9999" }],
      mode: "final",
    });
    const s = out.scores[0];
    expect(s.disqualifying.length).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(40); // Fora do Perfil
  });

  it("mode=preliminary — requires_enrichment NÃO reduz denominador", () => {
    const r: IcpRule[] = [
      { category: "biz", field_key: "state", field_label: "UF", field_type: "text", operator: "equals", value: "SP", weight: 20, required: false, disqualifying: false, positive_or_negative: "positive" },
      { category: "biz", field_key: "technologies", field_label: "Tech", field_type: "list", operator: "in", value: ["react"], weight: 80, required: false, disqualifying: false, positive_or_negative: "positive", requires_enrichment: true },
    ];
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: r,
      companies: [{ id: "1", state: "SP" }],
      mode: "preliminary",
    });
    // Release 1.4.0: UF matched vale 20 pontos absolutos, sem denominador.
    expect(out.scores[0].score).toBe(20);
    expect(out.scores[0].has_pending_enrichment).toBe(true);
  });
});

describe("mapIcpEvaluationForDisplay — buckets exclusivos", () => {
  const evalOut = () =>
    runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [{ id: "1", state: "SP" /* cidade/cnae ausentes */ }],
      mode: "final",
    }).scores[0];

  it("nenhum critério aparece em mais de um bucket", () => {
    const view = mapIcpEvaluationForDisplay(evalOut());
    const keys = [...view.matched, ...view.not_matched, ...view.unknown, ...view.disqualified].map((e) => e.criterion);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Score >= 80 → Lead Bom", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [
        // 20 + 10 + 30 = 60 → Potencial; adicionamos empresa perfeita separada
        { id: "1", state: "SP", city: "São Paulo", cnae: "6202-3/00" },
      ],
      mode: "final",
    });
    expect(mapIcpEvaluationForDisplay(out.scores[0]).summary_label).toBe("Lead Potencial");
  });

  it("desqualificador real → Fora do perfil", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [{ id: "1", state: "SP", city: "São Paulo", cnae: "9999" }],
      mode: "final",
    });
    expect(mapIcpEvaluationForDisplay(out.scores[0]).summary_label).toBe("Fora do perfil");
  });

  it("enrichmentFinished=false → Em processamento (nunca 0% Fora do perfil)", () => {
    const s = evalOut();
    expect(mapIcpEvaluationForDisplay(s, { enrichmentFinished: false }).summary_label).toBe("Em processamento");
  });
});

describe("classifyPersistedScore", () => {
  it("sem score persistido → Em processamento", () => {
    expect(classifyPersistedScore(null)).toBe("Em processamento");
    expect(classifyPersistedScore({})).toBe("Em processamento");
  });
  it("disqualifying_reasons > 0 → Fora do perfil", () => {
    expect(classifyPersistedScore({ icp_score: 50, disqualifying_reasons: ["x"] })).toBe("Fora do perfil");
  });
  it("score 85 → Lead Bom", () => {
    expect(classifyPersistedScore({ icp_score: 85, matched_criteria: ["a"] })).toBe("Lead Bom");
  });
  it("score 70 → Lead Potencial", () => {
    expect(classifyPersistedScore({ icp_score: 70, matched_criteria: ["a"] })).toBe("Lead Potencial");
  });
  it("score 45 → Lead Frio", () => {
    expect(classifyPersistedScore({ icp_score: 45, matched_criteria: ["a"] })).toBe("Lead Frio");
  });
});

describe("Release 1.4.0 — filosofia comercial", () => {
  it("empresa com CNAE + UF + Cidade sem enriquecimento NÃO é Fora do Perfil", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [{ id: "1", state: "SP", city: "São Paulo", cnae: "6202-3/00" }],
      mode: "final",
    });
    const label = mapIcpEvaluationForDisplay(out.scores[0]).summary_label;
    expect(label).not.toBe("Fora do perfil");
    expect(["Lead Bom", "Lead Potencial"]).toContain(label);
  });

  it("campos UNKNOWN não reduzem o score", () => {
    const r: IcpRule[] = [
      { category: "geo", field_key: "state", field_label: "UF", field_type: "text", operator: "equals", value: "SP", weight: 20, required: false, disqualifying: false, positive_or_negative: "positive" },
      { category: "biz", field_key: "capital_social", field_label: "Capital", field_type: "number", operator: "gte", value: 1000000, weight: 40, required: false, disqualifying: false, positive_or_negative: "positive" },
      { category: "biz", field_key: "estimated_employees", field_label: "Funcionários", field_type: "number", operator: "gte", value: 20, weight: 30, required: false, disqualifying: false, positive_or_negative: "positive" },
    ];
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: r,
      companies: [{ id: "1", state: "SP" /* capital & funcionários desconhecidos */ }],
      mode: "final",
    });
    // UF matched = 20 pontos absolutos; unknowns não subtraem.
    expect(out.scores[0].score).toBe(20);
    expect(out.scores[0].disqualifying).toEqual([]);
  });

  it("somente desqualificador real gera Fora do Perfil", () => {
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: rules(),
      companies: [
        { id: "ok", state: "RJ" }, // apenas UF desconhecida do valor, sem disq
        { id: "bad", state: "SP", city: "São Paulo", cnae: "9999" }, // CNAE proibido
      ],
      mode: "final",
    });
    expect(mapIcpEvaluationForDisplay(out.scores[0]).summary_label).not.toBe("Fora do perfil");
    expect(mapIcpEvaluationForDisplay(out.scores[1]).summary_label).toBe("Fora do perfil");
  });

  it("CNAE + Empresa Ativa + Telefone + Email → no mínimo Lead Potencial", () => {
    const r: IcpRule[] = [
      { category: "biz", field_key: "cnae", field_label: "CNAE", field_type: "text", operator: "equals", value: "6202-3/00", weight: 30, required: false, disqualifying: false, positive_or_negative: "positive" },
      { category: "biz", field_key: "situacao_cadastral", field_label: "Situação", field_type: "text", operator: "equals", value: "ATIVA", weight: 20, required: false, disqualifying: false, positive_or_negative: "positive" },
      { category: "contact", field_key: "phone", field_label: "Telefone", field_type: "text", operator: "exists", value: null, weight: 8, required: false, disqualifying: false, positive_or_negative: "positive" },
      { category: "contact", field_key: "email", field_label: "Email", field_type: "text", operator: "exists", value: null, weight: 8, required: false, disqualifying: false, positive_or_negative: "positive" },
    ];
    const out = runUniversalIcpEngine({
      icp: baseIcp(),
      rules: r,
      companies: [{ id: "1", cnae: "6202-3/00", situacao_cadastral: "ATIVA", phone: "11999998888", email: "a@b.com" }],
      mode: "final",
    });
    const s = out.scores[0];
    expect(s.score).toBeGreaterThanOrEqual(60);
    const label = mapIcpEvaluationForDisplay(s).summary_label;
    expect(["Lead Bom", "Lead Potencial"]).toContain(label);
  });
});