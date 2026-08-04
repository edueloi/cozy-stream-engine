import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EnrichmentPlan, EnrichmentResult } from "./orchestrator/interfaces";
import { sanitize } from "./orchestrator/sanitizer";

const enrichmentInputSchema = z.object({
  product_id: z.string().uuid().nullish(),
  icp_id: z.string().uuid().nullish(),
  prospecting_search_id: z.string().uuid().nullish(),
  prospecting_result_id: z.string().uuid().nullish(),
  cnpj: z.string().nullish(),
  strategy: z
    .enum(["CheapestFirst", "HighestQualityFirst", "PriorityOrder", "Balanced"])
    .optional(),
  budget_cents: z.number().int().nonnegative().nullish(),
  min_quality: z.number().int().min(0).max(100).nullish(),
  timeout_ms_per_step: z.number().int().positive().max(60000).optional(),
  max_parallel: z.number().int().min(1).max(8).optional(),
  required_fields: z.array(z.string()).optional(),
  optional_fields: z.array(z.string()).optional(),
  seed: z.record(z.any()).nullish(),
});

async function currentOrgId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  const org = data?.organization_id as string | undefined;
  if (!org) throw new Error("organization_not_found");
  return org;
}

async function assertFlag(organization_id: string) {
  const { isDataEngineEnabled } = await import("./cache.server");
  const ok = await isDataEngineEnabled(organization_id);
  if (!ok) throw new Error("jcs_data_engine_disabled");
}

export const buildPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => enrichmentInputSchema.parse(v))
  .handler(async ({ data, context }): Promise<EnrichmentPlan> => {
    const organization_id = await currentOrgId(context.supabase, context.userId);
    await assertFlag(organization_id);
    const { buildEnrichmentPlan } = await import("./orchestrator/planner.server");
    return sanitize(await buildEnrichmentPlan({ organization_id, ...(data as any) }));
  });

function stripRaw(result: EnrichmentResult): any {
  return sanitize(result);
}

export const executePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => enrichmentInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    const organization_id = await currentOrgId(context.supabase, context.userId);
    await assertFlag(organization_id);
    const { runEnrichment } = await import("./orchestrator/orchestrator.server");
    const r = await runEnrichment({ organization_id, ...(data as any) });
    return stripRaw(r);
  });

export const retryPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => enrichmentInputSchema.parse(v))
  .handler(async ({ data, context }) => {
    const organization_id = await currentOrgId(context.supabase, context.userId);
    await assertFlag(organization_id);
    const { retryPlanRun } = await import("./orchestrator/orchestrator.server");
    const r = await retryPlanRun({ organization_id, ...(data as any) });
    return stripRaw(r);
  });

export const cancelPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ execution_id: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const organization_id = await currentOrgId(context.supabase, context.userId);
    const { getExecutionRow } = await import("./orchestrator/executions-store.server");
    const row = await getExecutionRow(data.execution_id, organization_id);
    if (!row) throw new Error("execution_not_found");
    const { cancelPlan: doCancel } = await import("./orchestrator/orchestrator.server");
    await doCancel(data.execution_id);
    return { ok: true, execution_id: data.execution_id };
  });

export const getExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ execution_id: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const organization_id = await currentOrgId(context.supabase, context.userId);
    const { getExecutionRow } = await import("./orchestrator/executions-store.server");
    const row = await getExecutionRow(data.execution_id, organization_id);
    if (row) return sanitize(row);
    // Fallback legado: enrichment_jobs enquanto durar a transição.
    const { data: rows } = await (context.supabase.from("enrichment_jobs") as any)
      .select("*")
      .eq("organization_id", organization_id)
      .contains("metadata", { execution_id: data.execution_id })
      .limit(1);
    return (rows && rows[0]) ? sanitize(rows[0]) : null;
  });