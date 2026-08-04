/**
 * Server Functions do Smart Prospect Flow.
 * - runSmartFlowFn: 1 empresa
 * - runSmartFlowBatchFn: N empresas
 * Ambas protegidas pela flag `jcs_data_engine_enabled` no server module.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateSearchAgainstIcp, type IcpRuleLite } from "./smart-flow/validate";

export const runSmartFlowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    prospecting_result_id: string;
    prospecting_search_id?: string | null;
    icp_id?: string | null;
    product_id?: string | null;
    assumed_enrichment_cost_cents?: number;
  }) =>
    z.object({
      prospecting_result_id: z.string().uuid(),
      prospecting_search_id: z.string().uuid().nullable().optional(),
      icp_id: z.string().uuid().nullable().optional(),
      product_id: z.string().uuid().nullable().optional(),
      assumed_enrichment_cost_cents: z.number().int().min(0).max(1_000_000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const organization_id = (profile as any)?.organization_id as string | undefined;
    if (!organization_id) return { ok: false, reason: "no_org" };

    const { runSmartFlow } = await import("./smart-flow/smart-flow.server");
    return runSmartFlow({ organization_id, ...data });
  });

export const runSmartFlowBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    prospecting_result_ids: string[];
    prospecting_search_id?: string | null;
    icp_id?: string | null;
    product_id?: string | null;
    assumed_enrichment_cost_cents?: number;
    target_good_leads?: number;
    max_companies_to_analyze?: number;
    max_intelligence_credits?: number;
    preliminary_minimum_score?: number;
    final_minimum_score?: number;
  }) =>
    z.object({
      prospecting_result_ids: z.array(z.string().uuid()).min(1).max(500),
      prospecting_search_id: z.string().uuid().nullable().optional(),
      icp_id: z.string().uuid().nullable().optional(),
      product_id: z.string().uuid().nullable().optional(),
      assumed_enrichment_cost_cents: z.number().int().min(0).max(1_000_000).optional(),
      target_good_leads: z.number().int().min(1).max(10_000).optional(),
      max_companies_to_analyze: z.number().int().min(1).max(10_000).optional(),
      max_intelligence_credits: z.number().int().min(0).max(1_000_000).optional(),
      preliminary_minimum_score: z.number().min(0).max(100).optional(),
      final_minimum_score: z.number().min(0).max(100).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const organization_id = (profile as any)?.organization_id as string | undefined;
    if (!organization_id) return { ok: false, reason: "no_org", aggregate: null, per_result: [] };

    const { runSmartFlowBatch } = await import("./smart-flow/smart-flow.server");
    return runSmartFlowBatch({ organization_id, ...data });
  });

/**
 * Valida compatibilidade da busca contra o ICP resolvido (Produto ou ICP direto).
 * Puro em cima de dados carregados via Supabase — usado pela UI antes de
 * habilitar "Iniciar Prospecção Inteligente".
 */
export const validateSearchAgainstIcpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    product_id?: string | null;
    icp_id?: string | null;
    filters: Record<string, unknown>;
  }) =>
    z.object({
      product_id: z.string().uuid().nullable().optional(),
      icp_id: z.string().uuid().nullable().optional(),
      filters: z.record(z.string(), z.any()),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const organization_id = (profile as any)?.organization_id as string | undefined;
    if (!organization_id) {
      return { ok: false, reason: "no_org", compatible: false };
    }

    // Resolve ICP: direto → via produto → primeiro ativo
    let icpId = data.icp_id ?? null;
    if (!icpId && data.product_id) {
      const { data: p } = await context.supabase
        .from("product_catalog").select("icp_id").eq("id", data.product_id).maybeSingle();
      icpId = (p as any)?.icp_id ?? null;
    }
    if (!icpId) {
      return { ok: false, reason: "icp_not_resolved", compatible: false };
    }

    const [{ data: icp }, { data: rules }] = await Promise.all([
      context.supabase.from("ideal_customer_profiles")
        .select("id,name,minimum_score,preliminary_minimum_score").eq("id", icpId).maybeSingle(),
      context.supabase.from("icp_rules")
        .select("field_key,operator,value,required,disqualifying,positive_or_negative,weight,requires_enrichment")
        .eq("icp_id", icpId).order("order", { ascending: true }),
    ]);

    const result = validateSearchAgainstIcp({
      filters: data.filters as any,
      rules: (rules ?? []) as IcpRuleLite[],
    });

    return {
      ok: true,
      icp_id: icpId,
      icp_name: (icp as any)?.name ?? null,
      preliminary_minimum_score: (icp as any)?.preliminary_minimum_score ?? 70,
      final_minimum_score: (icp as any)?.minimum_score ?? 80,
      ...result,
    };
  });
