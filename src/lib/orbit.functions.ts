import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrgId(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("current_org_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Organização não encontrada.");
  return data as string;
}

export const getOrbitConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("organization_integrations")
      .select("config, active, updated_at")
      .eq("organization_id", orgId)
      .eq("provider", "orbit")
      .maybeSingle();
    const { maskedConfig } = await import("@/lib/orbit.server");
    const cfg = (data?.config as Record<string, unknown> | null) ?? null;
    return {
      configured: !!data,
      active: data?.active ?? false,
      updated_at: data?.updated_at ?? null,
      config: maskedConfig(cfg as never),
    };
  });

const SaveSchema = z.object({
  api_url: z.string().url(),
  api_token: z.string().optional(),
  default_pipeline_id: z.string().optional().nullable(),
  qualified_stage_id: z.string().optional().nullable(),
  meeting_stage_id: z.string().optional().nullable(),
  lost_stage_id: z.string().optional().nullable(),
  default_owner_id: z.string().optional().nullable(),
  auto_sync_enabled: z.boolean().optional(),
  score_threshold: z.coerce.number().int().min(0).max(100).optional(),
});

export const saveOrbitConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin
      .from("organization_integrations")
      .select("config")
      .eq("organization_id", orgId)
      .eq("provider", "orbit")
      .maybeSingle();
    const prevCfg = (prev?.config as Record<string, unknown>) ?? {};
    const next = {
      ...prevCfg,
      api_url: data.api_url,
      ...(data.api_token ? { api_token: data.api_token } : {}),
      default_pipeline_id: data.default_pipeline_id ?? null,
      qualified_stage_id: data.qualified_stage_id ?? null,
      meeting_stage_id: data.meeting_stage_id ?? null,
      lost_stage_id: data.lost_stage_id ?? null,
      default_owner_id: data.default_owner_id ?? null,
      auto_sync_enabled: data.auto_sync_enabled ?? false,
      score_threshold: data.score_threshold ?? 70,
    };
    const { error } = await supabaseAdmin
      .from("organization_integrations")
      .upsert(
        { organization_id: orgId, provider: "orbit", config: next as never, active: true },
        { onConflict: "organization_id,provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testOrbitConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context);
    const { getOrbitConfigForOrg, testOrbitConnection } = await import("@/lib/orbit.server");
    const cfg = await getOrbitConfigForOrg(orgId);
    if (!cfg) return { ok: false, error: "Integração não configurada." };
    return await testOrbitConnection(cfg);
  });

export const listOrbitPipelinesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context);
    const { getOrbitConfigForOrg, listOrbitPipelines } = await import("@/lib/orbit.server");
    const cfg = await getOrbitConfigForOrg(orgId);
    if (!cfg) throw new Error("Integração Orbit não configurada.");
    const pipelines = await listOrbitPipelines(cfg);
    return { pipelines };
  });

export const syncLeadToOrbitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { lead_id: string; force?: boolean }) =>
    z.object({ lead_id: z.string().uuid(), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context);
    const { syncLeadToOrbit } = await import("@/lib/orbit.server");
    return await syncLeadToOrbit(orgId, data.lead_id, { force: data.force });
  });

export const listOrbitSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { lead_id?: string; limit?: number } | undefined) =>
    z.object({ lead_id: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("orbit_sync_logs")
      .select("id, lead_id, event_type, status, error_message, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.lead_id) q = q.eq("lead_id", data.lead_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const getOrbitDashboardKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [sent, failed, won, lost, qualifiedTotal] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .not("orbit_deal_id", "is", null),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("orbit_sync_status", "failed"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "convertido"),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "descartado")
        .not("orbit_deal_id", "is", null),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", ["qualificado", "reuniao", "convertido"]),
    ]);
    const sentCount = sent.count ?? 0;
    const qualifiedCount = qualifiedTotal.count ?? 0;
    const conversion =
      qualifiedCount > 0 ? Math.round((sentCount / qualifiedCount) * 100) : 0;
    return {
      sent_to_orbit: sentCount,
      sync_errors: failed.count ?? 0,
      opportunities_won: won.count ?? 0,
      opportunities_lost: lost.count ?? 0,
      sdr_to_orbit_conversion: conversion,
    };
  });