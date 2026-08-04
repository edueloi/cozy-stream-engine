/**
 * RC2.1 — Pipeline Visual por empresa.
 *
 * Deriva 7 etapas a partir de dados JÁ persistidos:
 *   prospecting_results.smart_flow_status
 *   prospecting_results.smart_flow_metadata
 *   prospecting_results.cnpj
 *   prospecting_results.decision_makers_status
 *   prospecting_company_scores.icp_score / classification
 *
 * Não duplica regras do backend. Não faz I/O. Só reflete o que já existe.
 */
import { CheckCircle2, Circle, Loader2, AlertTriangle, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "running" | "skipped" | "failed" | "pending";

export interface PipelineStep {
  key: string;
  label: string;
  state: StepState;
  detail?: string;
}

interface Row {
  cnpj?: string | null;
  smart_flow_status?: string | null;
  smart_flow_metadata?: any;
  decision_makers_status?: string | null;
  discovery_source?: string | null;
}

interface ScoreRow {
  icp_score?: number | null;
  classification?: string | null;
  matched_criteria?: string[] | null;
}

export function derivePipelineSteps(row: Row | null | undefined, score: ScoreRow | null | undefined): PipelineStep[] {
  const r = row ?? {};
  const s = score ?? {};
  const status = String(r.smart_flow_status ?? "").toLowerCase();
  const meta = (r.smart_flow_metadata ?? {}) as any;
  const failure = meta.failure ?? null;
  const preliminary = meta.preliminary ?? null;
  const final = meta.final ?? null;
  const enrichment = meta.enrichment ?? null;
  const dm = String(r.decision_makers_status ?? "").toLowerCase();
  const isTerminal = ["enriquecido", "pronto_crm", "failed", "partial", "descartado_pelo_icp"].includes(status);
  const hasCnpj = !!(r.cnpj && String(r.cnpj).replace(/\D/g, "").length === 14);
  const skippedEnrichment = preliminary?.status === "frio" || preliminary?.status === "descartado";

  const steps: PipelineStep[] = [];

  // 1) Empresa encontrada — sempre concluída se a row existe
  steps.push({ key: "found", label: "Empresa encontrada", state: "done" });

  // 2) Pré-Score
  steps.push({
    key: "pre_score",
    label: "Pré-Score concluído",
    state: preliminary
      ? "done"
      : status === "aguardando_pre_score" || status === ""
        ? "running"
        : "pending",
    detail: preliminary ? `${preliminary.score}% · ${preliminary.status ?? ""}` : undefined,
  });

  // 3) CNPJ localizado
  const cnpjState: StepState = hasCnpj
    ? "done"
    : skippedEnrichment
      ? "skipped"
      : isTerminal
        ? "failed"
        : preliminary
          ? "running"
          : "pending";
  steps.push({
    key: "cnpj",
    label: "CNPJ localizado",
    state: cnpjState,
    detail: hasCnpj ? undefined : cnpjState === "failed" ? "Não localizado" : undefined,
  });

  // 4) Enriquecimento
  const enrState: StepState =
    skippedEnrichment ? "skipped"
    : enrichment ? "done"
    : status === "enriquecendo" ? "running"
    : failure ? "failed"
    : isTerminal ? "skipped"
    : "pending";
  steps.push({
    key: "enrichment",
    label: "Enriquecimento concluído",
    state: enrState,
    detail: enrichment?.data_quality_score != null ? `qualidade ${enrichment.data_quality_score}` : undefined,
  });

  // 5) Score Final
  const scoreState: StepState =
    s.icp_score != null && (final || isTerminal) ? "done"
    : failure ? "failed"
    : preliminary ? "running"
    : "pending";
  steps.push({
    key: "final_score",
    label: "Score Final calculado",
    state: scoreState,
    detail: s.icp_score != null ? `${s.icp_score}%` : undefined,
  });

  // 6) Decisor pesquisado
  const dmState: StepState =
    dm === "found" ? "done"
    : dm === "not_found" ? "failed"
    : dm === "skipped" || dm === "not_required" || skippedEnrichment ? "skipped"
    : status === "aguardando_decisor" ? "running"
    : "pending";
  steps.push({
    key: "decision_makers",
    label: "Decisor pesquisado",
    state: dmState,
  });

  // 7) Finalizado
  steps.push({
    key: "finalized",
    label: "Finalizado",
    state: failure ? "failed" : isTerminal ? "done" : "pending",
    detail: failure ? friendlyFailureReason(failure.reason) : undefined,
  });

  return steps;
}

function friendlyFailureReason(r?: string): string {
  switch (r) {
    case "enrichment_timeout": return "Tempo limite excedido — reprocessar";
    case "provider_exhausted": return "Fontes indisponíveis";
    case "budget_exhausted": return "Limite de créditos atingido";
    case "missing_required_data": return "Dados obrigatórios ausentes";
    default: return "Erro inesperado — reprocessar";
  }
}

export function ProspectPipelineSteps({ row, score, className }: { row: Row | null | undefined; score: ScoreRow | null | undefined; className?: string }) {
  const steps = derivePipelineSteps(row, score);
  return (
    <ol className={cn("space-y-1.5", className)}>
      {steps.map((s) => (
        <li key={s.key} className="flex items-start gap-2 text-sm">
          <StepIcon state={s.state} />
          <div className="flex-1">
            <div className={cn(
              "leading-tight",
              s.state === "skipped" && "text-muted-foreground",
              s.state === "failed" && "text-amber-700 dark:text-amber-400",
            )}>
              {s.label}
            </div>
            {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const cls = "h-4 w-4 mt-0.5 shrink-0";
  if (state === "done") return <CheckCircle2 className={cn(cls, "text-emerald-600")} />;
  if (state === "running") return <Loader2 className={cn(cls, "text-blue-600 animate-spin")} />;
  if (state === "failed") return <AlertTriangle className={cn(cls, "text-amber-600")} />;
  if (state === "skipped") return <Minus className={cn(cls, "text-muted-foreground")} />;
  return <Circle className={cn(cls, "text-muted-foreground")} />;
}