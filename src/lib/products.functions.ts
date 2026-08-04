import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateIcpScore, type IcpCriteria, type IcpWeights } from "./icp-scorer";

/**
 * Pure helper for UI-level filtering. Kept here so it can be unit-tested
 * without spinning up the Supabase client. Backend still enforces org
 * isolation via RLS on `product_catalog`.
 */
export function filterActiveProducts<T extends { status?: string | null }>(items: T[]): T[] {
  return (items ?? []).filter((p) => (p?.status ?? "active") === "active");
}

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1),
  descricao: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  icp_id: z.string().uuid().nullable().optional(),
  produto_padrao: z.boolean().default(false),
  icone: z.string().nullable().optional(),
  cor: z.string().nullable().optional(),
  ordem: z.number().int().default(0),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("product_catalog")
      .select("*")
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { id, ...rest } = data;
      const { data: row, error } = await context.supabase
        .from("product_catalog")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      // enforce single produto_padrao per org
      if (rest.produto_padrao) {
        await context.supabase
          .from("product_catalog")
          .update({ produto_padrao: false })
          .neq("id", id)
          .eq("produto_padrao", true);
      }
      return row;
    }
    const { data: orgId } = await context.supabase.rpc("current_org_id");
    if (!orgId) throw new Error("Organização não encontrada.");
    const { data: row, error } = await context.supabase
      .from("product_catalog")
      .insert({ ...data, organization_id: orgId, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (data.produto_padrao) {
      await context.supabase
        .from("product_catalog")
        .update({ produto_padrao: false })
        .neq("id", row.id)
        .eq("produto_padrao", true);
    }
    return row;
  });

export const duplicateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("product_catalog")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { id, created_at, updated_at, ...rest } = src as any;
    const { data: row, error: e2 } = await context.supabase
      .from("product_catalog")
      .insert({ ...rest, nome: `${src.nome} (cópia)`, produto_padrao: false, created_by: context.userId })
      .select()
      .single();
    if (e2) throw new Error(e2.message);
    return row;
  });

export const toggleProductStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "active" | "inactive" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "inactive"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("product_catalog")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("product_catalog")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Universal ICP Engine: classify results without importing.
// Accepts either an icpId OR a productId (resolves product.icp_id).
export const classifyResultsByICP = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { icpId?: string; productId?: string; resultIds: string[] }) =>
    z
      .object({
        icpId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        resultIds: z.array(z.string().uuid()).min(1).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let icpId = data.icpId ?? null;
    if (!icpId && data.productId) {
      const { data: prod } = await context.supabase
        .from("product_catalog")
        .select("icp_id")
        .eq("id", data.productId)
        .maybeSingle();
      icpId = (prod as any)?.icp_id ?? null;
    }
    if (!icpId) {
      return {
        icpId: null,
        results: data.resultIds.map((id) => ({
          id,
          score: 0,
          classification: "unclassified" as const,
          matched: [],
          missing: [],
          disqualifying: [],
        })),
        summary: { good: 0, review: 0, outside: 0, unclassified: data.resultIds.length },
      };
    }

    const { data: icp, error: e1 } = await context.supabase
      .from("ideal_customer_profiles")
      .select("*")
      .eq("id", icpId)
      .single();
    if (e1) throw new Error(e1.message);

    const { data: rows, error: e2 } = await context.supabase
      .from("prospecting_results")
      .select("*")
      .in("id", data.resultIds);
    if (e2) throw new Error(e2.message);

    const criteria = (icp.criteria_json ?? {}) as IcpCriteria;
    const weights = (icp.weights_json ?? {}) as IcpWeights;

    let good = 0, review = 0, outside = 0;
    const results = (rows ?? []).map((r: any) => {
      const out = calculateIcpScore(r, criteria, weights);
      let classification: "good_lead" | "review" | "outside_profile";
      if (out.score >= 80) { classification = "good_lead"; good++; }
      else if (out.score >= 60) { classification = "review"; review++; }
      else { classification = "outside_profile"; outside++; }
      return {
        id: r.id,
        score: out.score,
        classification,
        matched: out.matched,
        missing: out.missing,
        disqualifying: out.disqualifying,
      };
    });

    return { icpId, results, summary: { good, review, outside, unclassified: 0 } };
  });

export const getUniversalIcpFlag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("universal_icp_enabled")
      .maybeSingle();
    return { enabled: Boolean((data as any)?.universal_icp_enabled) };
  });

export const setUniversalIcpFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { enabled: boolean }) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: orgId } = await context.supabase.rpc("current_org_id");
    if (!orgId) throw new Error("Organização não encontrada.");
    const { error } = await context.supabase
      .from("app_settings")
      .update({ universal_icp_enabled: data.enabled })
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });