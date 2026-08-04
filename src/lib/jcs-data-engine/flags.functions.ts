/**
 * Flags do JCS Data Engine + Smart Prospect Flow.
 * Duas flags precisam estar ON para mostrar/executar o novo fluxo:
 *   - jcs_data_engine_enabled  (motor server-side)
 *   - smart_flow_ui_enabled    (experiência beta na UI)
 * Quando qualquer uma está OFF, a Prospecção continua exatamente como hoje.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSmartFlowFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("jcs_data_engine_enabled, smart_flow_ui_enabled")
      .maybeSingle();
    const engine = Boolean((data as any)?.jcs_data_engine_enabled);
    const ui = Boolean((data as any)?.smart_flow_ui_enabled);
    return {
      jcs_data_engine_enabled: engine,
      smart_flow_ui_enabled: ui,
      smart_flow_available: engine && ui,
    };
  });

/** Combinador puro (para testes e uso client-side). */
export function isSmartFlowAvailable(flags: {
  jcs_data_engine_enabled?: boolean | null;
  smart_flow_ui_enabled?: boolean | null;
}): boolean {
  return Boolean(flags.jcs_data_engine_enabled) && Boolean(flags.smart_flow_ui_enabled);
}

/**
 * Diagnóstico completo — usado pela aba Diagnóstico do SuperAdmin.
 * Retorna todas as flags relevantes + org atual + papéis + provedores ativos.
 * Não altera regras de negócio; leitura server-side com RLS do usuário.
 */
export const getProspectingDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: settings } = await context.supabase
      .from("app_settings")
      .select(
        "organization_id, jcs_data_engine_enabled, smart_flow_ui_enabled, universal_icp_enabled, pre_icp_scoring_enabled, tenant_provider_settings_enabled",
      )
      .maybeSingle();

    const { data: rolesRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesRows ?? []).map((r: { role: string }) => r.role);

    const orgId = (settings as any)?.organization_id ?? null;
    let providers: Array<{ provider: string; enabled: boolean; status: string | null; priority: number | null }> = [];
    if (orgId) {
      const { data: prov } = await context.supabase
        .from("provider_credentials")
        .select("provider, enabled, status, priority")
        .eq("organization_id", orgId);
      providers = (prov ?? []) as any;
    }

    const engine = Boolean((settings as any)?.jcs_data_engine_enabled);
    const ui = Boolean((settings as any)?.smart_flow_ui_enabled);

    const blockers: string[] = [];
    if (!engine) blockers.push("jcs_data_engine_enabled");
    if (!ui) blockers.push("smart_flow_ui_enabled");

    return {
      user_id: context.userId,
      roles,
      is_superadmin: roles.includes("superadmin"),
      organization_id: orgId,
      flags: {
        jcs_data_engine_enabled: engine,
        smart_flow_ui_enabled: ui,
        universal_icp_enabled: Boolean((settings as any)?.universal_icp_enabled),
        pre_icp_scoring_enabled: Boolean((settings as any)?.pre_icp_scoring_enabled),
        tenant_provider_settings_enabled: Boolean((settings as any)?.tenant_provider_settings_enabled),
      },
      smart_flow_available: engine && ui,
      flow_in_use: engine && ui ? "smart_flow" : "legacy",
      blockers,
      providers,
      default_provider: providers.find((p) => p.enabled)?.provider ?? null,
    };
  });