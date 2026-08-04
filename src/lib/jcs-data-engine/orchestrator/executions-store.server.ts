import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitize } from "./sanitizer";
import type { EnrichmentPlan, EnrichmentResult } from "./interfaces";

export type ExecutionStatus =
  | "pending" | "planning" | "processing"
  | "completed" | "partial" | "failed"
  | "cancelled" | "budget_exhausted" | "quality_reached";

function randomUuid(): string {
  return (globalThis as any).crypto?.randomUUID?.()
    ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
}

export async function createExecution(params: {
  organization_id: string;
  execution_id?: string;
  prospecting_search_id?: string | null;
  prospecting_result_id?: string | null;
  product_id?: string | null;
  icp_id?: string | null;
  strategy?: string | null;
  created_by?: string | null;
}): Promise<string> {
  const execution_id = params.execution_id ?? randomUuid();
  await (supabaseAdmin.from("enrichment_executions") as any).insert({
    organization_id: params.organization_id,
    execution_id,
    prospecting_search_id: params.prospecting_search_id ?? null,
    prospecting_result_id: params.prospecting_result_id ?? null,
    product_id: params.product_id ?? null,
    icp_id: params.icp_id ?? null,
    strategy: params.strategy ?? null,
    status: "pending",
    started_at: new Date().toISOString(),
    created_by: params.created_by ?? null,
  });
  return execution_id;
}

export async function setPlan(execution_id: string, plan: EnrichmentPlan) {
  await (supabaseAdmin.from("enrichment_executions") as any)
    .update({ status: "planning", plan_json: sanitize(plan) })
    .eq("execution_id", execution_id);
}

export async function setProcessing(execution_id: string) {
  await (supabaseAdmin.from("enrichment_executions") as any)
    .update({ status: "processing" })
    .eq("execution_id", execution_id);
}

export async function completeExecution(
  execution_id: string,
  status: ExecutionStatus,
  result: EnrichmentResult,
) {
  await (supabaseAdmin.from("enrichment_executions") as any)
    .update({
      status,
      result_json: sanitize(result),
      cost_cents: result.cost_cents,
      finished_at: new Date().toISOString(),
    })
    .eq("execution_id", execution_id);
}

export async function failExecution(execution_id: string, err: unknown) {
  const message = (err as any)?.message ?? String(err);
  await (supabaseAdmin.from("enrichment_executions") as any)
    .update({
      status: "failed",
      error_json: sanitize({ message }),
      finished_at: new Date().toISOString(),
    })
    .eq("execution_id", execution_id);
}

export async function markCancelled(execution_id: string) {
  const now = new Date().toISOString();
  await (supabaseAdmin.from("enrichment_executions") as any)
    .update({ status: "cancelled", cancelled_at: now, finished_at: now })
    .eq("execution_id", execution_id);
}

export async function isCancelled(execution_id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("enrichment_executions")
    .select("status")
    .eq("execution_id", execution_id)
    .maybeSingle();
  return (data as any)?.status === "cancelled";
}

export async function getExecutionRow(execution_id: string, organization_id: string) {
  const { data } = await supabaseAdmin
    .from("enrichment_executions")
    .select("*")
    .eq("execution_id", execution_id)
    .eq("organization_id", organization_id)
    .maybeSingle();
  return data;
}