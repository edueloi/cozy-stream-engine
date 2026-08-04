/**
 * Server functions do Motor Universal de ICP (Fase B).
 * - classifyUniversal: carrega ICP + regras, roda o motor, persiste em
 *   prospecting_company_scores e devolve reasons/breakdown + dashboard.
 *
 * NÃO altera estrutura de nenhuma tabela existente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  runUniversalIcpEngine,
  mapProspectingResultToUniversal,
  type IcpRule,
} from "./universal-icp-engine";

export const classifyUniversal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    icpId?: string;
    productId?: string;
    resultIds: string[];
    persist?: boolean;
  }) =>
    z
      .object({
        icpId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        resultIds: z.array(z.string().uuid()).min(1).max(2000),
        persist: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // 1) Resolve ICP (direto ou via produto).
    let icpId = data.icpId ?? null;
    if (!icpId && data.productId) {
      const { data: prod } = await context.supabase
        .from("product_catalog")
        .select("icp_id")
        .eq("id", data.productId)
        .maybeSingle();
      icpId = (prod as any)?.icp_id ?? null;
    }
    if (!icpId) throw new Error("Selecione um ICP ou um produto vinculado a um ICP.");

    // 2) Carrega ICP + regras dinâmicas (se houver) + resultados em lote.
    const [{ data: icp, error: e1 }, { data: rulesRows }, { data: rows, error: e3 }] =
      await Promise.all([
        context.supabase.from("ideal_customer_profiles").select("*").eq("id", icpId).single(),
        context.supabase.from("icp_rules").select("*").eq("icp_id", icpId).order("order", { ascending: true }),
        context.supabase.from("prospecting_results").select("*").in("id", data.resultIds),
      ]);
    if (e1) throw new Error(e1.message);
    if (e3) throw new Error(e3.message);

    // 3) Roda o motor uma única vez em lote.
    const engineOut = runUniversalIcpEngine({
      icp: {
        id: icp.id,
        minimum_score: icp.minimum_score ?? 80,
        criteria_json: icp.criteria_json,
        weights_json: icp.weights_json,
      },
      rules: (rulesRows ?? []) as IcpRule[],
      companies: (rows ?? []).map(mapProspectingResultToUniversal),
    });

    // 4) Persistência opcional (não altera schema — apenas grava).
    if (data.persist && engineOut.scores.length > 0) {
      const orgId = icp.organization_id;
      const payload = engineOut.scores.map((s) => ({
        organization_id: orgId,
        prospecting_result_id: s.id,
        icp_id: icp.id,
        icp_score: s.score,
        classification:
          s.rating === "Excelente" || s.rating === "Bom"
            ? "good_lead"
            : s.rating === "Potencial" || s.rating === "Frio"
              ? "review"
              : "outside_profile",
        matched_criteria: s.matched,
        missing_criteria: s.missing,
        disqualifying_reasons: s.disqualifying,
        qualified_for_import: s.qualified_for_import,
        calculated_at: new Date().toISOString(),
      }));
      await context.supabase
        .from("prospecting_company_scores")
        .upsert(payload, { onConflict: "prospecting_result_id,icp_id" });
    }

    return { icpId: icp.id, scores: engineOut.scores, summary: engineOut.summary };
  });

/**
 * Pré-Score ICP (Fase Pré-Enriquecimento).
 *
 * Roda o motor no modo "preliminary": ignora critérios que dependem de
 * enriquecimento pago (Apify etc.) e classifica somente com os dados básicos
 * já disponíveis. NÃO grava `icp_score` nem `classification` — apenas
 * `preliminary_score` + `pre_score_stage` no `prospecting_results`.
 *
 * Estágios:
 *   - eligible_for_enrichment  → score >= preliminary_minimum_score e sem desqualificador
 *   - review_before_enrichment → 50..(min-1)
 *   - rejected_before_enrichment → < 50 ou desqualificador acionado
 */
export const preliminaryClassify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    icpId?: string;
    productId?: string;
    resultIds: string[];
    persist?: boolean;
  }) =>
    z
      .object({
        icpId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        resultIds: z.array(z.string().uuid()).min(1).max(2000),
        persist: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // 1) Resolve ICP (direto ou via produto).
    let icpId = data.icpId ?? null;
    if (!icpId && data.productId) {
      const { data: prod } = await context.supabase
        .from("product_catalog")
        .select("icp_id")
        .eq("id", data.productId)
        .maybeSingle();
      icpId = (prod as any)?.icp_id ?? null;
    }
    if (!icpId) throw new Error("Selecione um ICP ou um produto vinculado a um ICP.");

    // 2) Carrega ICP + regras + resultados em lote.
    const [{ data: icp, error: e1 }, { data: rulesRows }, { data: rows, error: e3 }] =
      await Promise.all([
        context.supabase.from("ideal_customer_profiles").select("*").eq("id", icpId).single(),
        context.supabase.from("icp_rules").select("*").eq("icp_id", icpId).order("order", { ascending: true }),
        context.supabase.from("prospecting_results").select("*").in("id", data.resultIds),
      ]);
    if (e1) throw new Error(e1.message);
    if (e3) throw new Error(e3.message);

    const preliminaryMin = (icp as any).preliminary_minimum_score ?? 70;

    // 3) Motor em modo "preliminary".
    const engineOut = runUniversalIcpEngine({
      icp: {
        id: icp.id,
        minimum_score: icp.minimum_score ?? 80,
        preliminary_minimum_score: preliminaryMin,
        criteria_json: icp.criteria_json,
        weights_json: icp.weights_json,
      },
      rules: (rulesRows ?? []) as IcpRule[],
      companies: (rows ?? []).map(mapProspectingResultToUniversal),
      mode: "preliminary",
    });

    // 4) Deriva estágio + persiste preliminary_score sem tocar em icp_score.
    const stageFor = (s: { score: number; disqualifying: string[] }) => {
      if (s.disqualifying.length > 0) return "rejected_before_enrichment";
      if (s.score >= preliminaryMin) return "eligible_for_enrichment";
      if (s.score >= 50) return "review_before_enrichment";
      return "rejected_before_enrichment";
    };

    const decorated = engineOut.scores.map((s) => ({ ...s, stage: stageFor(s) }));

    if (data.persist && decorated.length > 0) {
      // Atualiza um por vez para respeitar RLS + escopar por id.
      await Promise.all(
        decorated.map((s) =>
          context.supabase
            .from("prospecting_results")
            .update({
              preliminary_score: s.score,
              pre_score_stage: s.stage,
            } as any)
            .eq("id", s.id),
        ),
      );
    }

    // 5) Sumário
    let eligible = 0, review = 0, rejected = 0;
    for (const s of decorated) {
      if (s.stage === "eligible_for_enrichment") eligible++;
      else if (s.stage === "review_before_enrichment") review++;
      else rejected++;
    }

    return {
      icpId: icp.id,
      preliminary_minimum_score: preliminaryMin,
      scores: decorated,
      summary: {
        ...engineOut.summary,
        eligible_for_enrichment: eligible,
        review_before_enrichment: review,
        rejected_before_enrichment: rejected,
      },
    };
  });

/** Lê a flag `pre_icp_scoring_enabled` da organização atual. */
export const getPreIcpScoringFlag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const orgId = (profile as any)?.organization_id;
    if (!orgId) return { enabled: false };
    const { data: s } = await context.supabase
      .from("app_settings").select("pre_icp_scoring_enabled").eq("organization_id", orgId).maybeSingle();
    return { enabled: Boolean((s as any)?.pre_icp_scoring_enabled) };
  });