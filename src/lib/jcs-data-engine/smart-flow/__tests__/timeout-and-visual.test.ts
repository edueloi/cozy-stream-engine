import { describe, it, expect } from "vitest";
import { classifySmartFlowFailure } from "../smart-flow.server";
import { derivePipelineSteps } from "@/components/prospect-pipeline-steps";

describe("RC2.1 — classifySmartFlowFailure", () => {
  it("mapeia timeout para enrichment_timeout", () => {
    expect(classifySmartFlowFailure(new Error("smart_flow_company timeout after 90000ms"))).toBe(
      "enrichment_timeout",
    );
  });
  it("mapeia budget/saldo para budget_exhausted", () => {
    expect(classifySmartFlowFailure(new Error("budget reached"))).toBe("budget_exhausted");
    expect(classifySmartFlowFailure(new Error("saldo insuficiente"))).toBe("budget_exhausted");
  });
  it("mapeia provider ausente para provider_exhausted", () => {
    expect(classifySmartFlowFailure(new Error("no_provider available"))).toBe("provider_exhausted");
  });
  it("erro desconhecido não vaza stack — vira unexpected_error", () => {
    expect(classifySmartFlowFailure(new Error("kaboom"))).toBe("unexpected_error");
  });
});

describe("RC2.1 — Pipeline Visual (derive from persisted state)", () => {
  it("empresa nova sem estado: só 'Empresa encontrada' concluída", () => {
    const steps = derivePipelineSteps({}, null);
    expect(steps[0]).toMatchObject({ key: "found", state: "done" });
    expect(steps.find((s) => s.key === "pre_score")?.state).toBe("running");
    expect(steps.find((s) => s.key === "finalized")?.state).toBe("pending");
  });

  it("frio pula enriquecimento e decisor (skipped, não failed)", () => {
    const row = {
      smart_flow_status: "enriquecido",
      smart_flow_metadata: { preliminary: { score: 45, status: "frio" } },
    };
    const steps = derivePipelineSteps(row, { icp_score: 45 });
    expect(steps.find((s) => s.key === "enrichment")?.state).toBe("skipped");
    expect(steps.find((s) => s.key === "decision_makers")?.state).toBe("skipped");
    expect(steps.find((s) => s.key === "finalized")?.state).toBe("done");
  });

  it("CNPJ ausente após pré-score elegível: cnpj em 'running', não 'failed'", () => {
    const row = {
      cnpj: null,
      smart_flow_status: "enriquecendo",
      smart_flow_metadata: { preliminary: { score: 85, status: "promissor" } },
    };
    const steps = derivePipelineSteps(row, null);
    expect(steps.find((s) => s.key === "cnpj")?.state).toBe("running");
  });

  it("timeout produz etapa Finalizado 'failed' com motivo amigável", () => {
    const row = {
      smart_flow_status: "failed",
      smart_flow_metadata: { failure: { reason: "enrichment_timeout" } },
    };
    const steps = derivePipelineSteps(row, null);
    const fin = steps.find((s) => s.key === "finalized")!;
    expect(fin.state).toBe("failed");
    expect(fin.detail).toContain("Tempo limite");
  });

  it("decisor encontrado: etapa done", () => {
    const row = {
      cnpj: "12345678000199",
      smart_flow_status: "pronto_crm",
      decision_makers_status: "found",
      smart_flow_metadata: {
        preliminary: { score: 85, status: "promissor" },
        final: { score: 90 },
        enrichment: { data_quality_score: 88 },
      },
    };
    const steps = derivePipelineSteps(row, { icp_score: 90 });
    expect(steps.find((s) => s.key === "cnpj")?.state).toBe("done");
    expect(steps.find((s) => s.key === "enrichment")?.state).toBe("done");
    expect(steps.find((s) => s.key === "final_score")?.state).toBe("done");
    expect(steps.find((s) => s.key === "decision_makers")?.state).toBe("done");
    expect(steps.find((s) => s.key === "finalized")?.state).toBe("done");
  });
});