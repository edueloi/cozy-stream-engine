import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateIcpScore, type IcpCriteria, type IcpWeights } from "./icp-scorer";

const CriteriaSchema = z.object({
  desired_cnaes: z.array(z.string()).optional(),
  forbidden_cnaes: z.array(z.string()).optional(),
  segments: z.array(z.string()).optional(),
  states: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  portes: z.array(z.string()).optional(),
  min_capital_social: z.number().nullable().optional(),
  min_faturamento: z.number().nullable().optional(),
  min_employees: z.number().nullable().optional(),
  max_employees: z.number().nullable().optional(),
  situacao_cadastral: z.array(z.string()).optional(),
  min_company_age_years: z.number().nullable().optional(),
  desired_roles: z.array(z.string()).optional(),
  forbidden_roles: z.array(z.string()).optional(),
  required_criteria: z.array(z.string()).optional(),
});

const WeightsSchema = z.record(z.string(), z.number());

export const listIcps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ideal_customer_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const getIcp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("ideal_customer_profiles")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  product_or_service: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  criteria_json: CriteriaSchema.default({}),
  weights_json: WeightsSchema.default({}),
  minimum_score: z.number().int().min(0).max(100).default(80),
});

export const upsertIcp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload: any = { ...data };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("ideal_customer_profiles")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    payload.created_by = context.userId;
    const { data: row, error } = await context.supabase
      .from("ideal_customer_profiles")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const duplicateIcp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("ideal_customer_profiles")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { id, created_at, updated_at, ...rest } = src as any;
    const { data: row, error: e2 } = await context.supabase
      .from("ideal_customer_profiles")
      .insert({ ...rest, name: `${src.name} (cópia)`, created_by: context.userId })
      .select()
      .single();
    if (e2) throw new Error(e2.message);
    return row;
  });

export const toggleIcpStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "active" | "inactive" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "inactive"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ideal_customer_profiles")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIcp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ideal_customer_profiles")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getFeatureFlag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("smart_prospect_engine_enabled")
      .maybeSingle();
    return { enabled: Boolean((data as any)?.smart_prospect_engine_enabled) };
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { enabled: boolean }) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: orgId } = await context.supabase.rpc("current_org_id");
    if (!orgId) throw new Error("Organização não encontrada.");
    const { error } = await context.supabase
      .from("app_settings")
      .update({ smart_prospect_engine_enabled: data.enabled })
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const scoreResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { icpId: string; resultIds: string[] }) =>
    z
      .object({
        icpId: z.string().uuid(),
        resultIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: icp, error: e1 } = await context.supabase
      .from("ideal_customer_profiles")
      .select("*")
      .eq("id", data.icpId)
      .single();
    if (e1) throw new Error(e1.message);
    const { data: rows, error: e2 } = await context.supabase
      .from("prospecting_results")
      .select("*")
      .in("id", data.resultIds);
    if (e2) throw new Error(e2.message);

    const criteria = (icp.criteria_json ?? {}) as IcpCriteria;
    const weights = (icp.weights_json ?? {}) as IcpWeights;
    const minScore = icp.minimum_score ?? 80;
    const orgId = icp.organization_id;

    let good = 0;
    let review = 0;
    let outside = 0;

    for (const r of rows ?? []) {
      const out = calculateIcpScore(r as any, criteria, weights);
      let classification: "good_lead" | "review" | "outside_profile";
      if (out.score >= 80) classification = "good_lead";
      else if (out.score >= 60) classification = "review";
      else classification = "outside_profile";
      if (classification === "good_lead") good++;
      else if (classification === "review") review++;
      else outside++;
      const qualified = out.score >= minScore && out.disqualifying.length === 0;
      await context.supabase
        .from("prospecting_company_scores")
        .upsert(
          {
            organization_id: orgId,
            prospecting_result_id: r.id,
            icp_id: icp.id,
            icp_score: out.score,
            classification,
            matched_criteria: out.matched,
            missing_criteria: out.missing,
            disqualifying_reasons: out.disqualifying,
            qualified_for_import: qualified,
            calculated_at: new Date().toISOString(),
          },
          { onConflict: "prospecting_result_id,icp_id" },
        );
    }
    return { processed: rows?.length ?? 0, good, review, outside };
  });

export const listScoresForSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { icpId: string; resultIds: string[] }) =>
    z
      .object({
        icpId: z.string().uuid(),
        resultIds: z.array(z.string().uuid()).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.resultIds.length === 0) return { items: [] };
    const { data: rows, error } = await context.supabase
      .from("prospecting_company_scores")
      .select("*")
      .eq("icp_id", data.icpId)
      .in("prospecting_result_id", data.resultIds);
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });