import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Plans catalog (all active plans). */
export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("organization_plans")
      .select("*")
      .eq("status", "active")
      .order("monthly_price_cents", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Current org subscription, plan, and usage for the active month. */
export const getCurrentBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: orgIdRaw } = await supabase.rpc("current_org_id");
    const orgId = orgIdRaw as unknown as string | null;
    if (!orgId) return { subscription: null, plan: null, usage: null, organization: null };

    const { data: organization } = await supabase
      .from("organizations")
      .select("id, name, plan, status, trial_ends_at")
      .eq("id", orgId)
      .maybeSingle();

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const planCode = subscription?.plan_code ?? organization?.plan ?? "starter";
    const { data: plan } = await supabase
      .from("organization_plans")
      .select("*")
      .eq("code", planCode)
      .maybeSingle();

    const periodMonth = new Date();
    periodMonth.setUTCDate(1);
    periodMonth.setUTCHours(0, 0, 0, 0);
    const periodIso = periodMonth.toISOString().slice(0, 10);

    const { data: usage } = await supabase
      .from("usage_counters" as never)
      .select("*")
      .eq("organization_id", orgId)
      .eq("period_month", periodIso)
      .maybeSingle();

    return { organization, subscription, plan, usage: usage ?? null };
  });

/** Recent billing events (history) for the current org. */
export const listBillingEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: orgIdRaw } = await supabase.rpc("current_org_id");
    const orgId = orgIdRaw as unknown as string | null;
    if (!orgId) return [];
    const { data, error } = await supabase
      .from("billing_history")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Compute current limit/usage status and whether each action is allowed. */
export const getLimitsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: orgIdRaw } = await supabase.rpc("current_org_id");
    const orgId = orgIdRaw as unknown as string | null;
    if (!orgId) throw new Error("Sem organização");

    const { data: organization } = await supabase
      .from("organizations")
      .select("plan, status")
      .eq("id", orgId)
      .maybeSingle();
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, plan_code")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const planCode = subscription?.plan_code ?? organization?.plan ?? "starter";
    const subscriptionStatus = subscription?.status ?? organization?.status ?? "trial";

    const { data: plan } = await supabase
      .from("organization_plans")
      .select("*")
      .eq("code", planCode)
      .maybeSingle();
    if (!plan) throw new Error("Plano não encontrado");

    const periodMonth = new Date();
    periodMonth.setUTCDate(1);
    periodMonth.setUTCHours(0, 0, 0, 0);
    const periodIso = periodMonth.toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("usage_counters" as never)
      .select("*")
      .eq("organization_id", orgId)
      .eq("period_month", periodIso)
      .maybeSingle();

    const within = (used: number, limit: number) => limit < 0 || used < limit;
    const blocked = subscriptionStatus === "blocked" || subscriptionStatus === "expired";
    const pastDue = subscriptionStatus === "past_due";

    const u = (usage as Record<string, number> | null) ?? {};

    return {
      planCode,
      planName: plan.name,
      subscriptionStatus,
      blocked,
      pastDue,
      features: {
        voice_ai: plan.voice_ai_enabled,
        apify: plan.apify_enabled,
        orbit: plan.orbit_enabled,
        white_label: plan.white_label_enabled,
        advanced_analytics: plan.advanced_analytics_enabled,
      },
      limits: {
        users: { used: u.users_count ?? 0, limit: plan.limite_usuarios },
        leads: { used: u.leads_count ?? 0, limit: plan.limite_leads },
        agents: { used: u.agents_count ?? 0, limit: plan.limite_agentes },
        cadences: { used: u.cadences_count ?? 0, limit: plan.limite_mensagens },
        messages: { used: u.messages_sent ?? 0, limit: plan.limite_mensagens },
        calls: { used: u.calls_made ?? 0, limit: plan.max_calls_month },
        apify: { used: u.apify_runs ?? 0, limit: plan.limite_importacoes },
      },
      can: {
        create_user: !blocked && within(u.users_count ?? 0, plan.limite_usuarios),
        create_lead: !blocked && within(u.leads_count ?? 0, plan.limite_leads),
        create_agent: !blocked && within(u.agents_count ?? 0, plan.limite_agentes),
        create_cadence: !blocked && !pastDue,
        send_message: !blocked && !pastDue && within(u.messages_sent ?? 0, plan.limite_mensagens),
        make_call: !blocked && !pastDue && within(u.calls_made ?? 0, plan.max_calls_month),
        run_apify: !blocked && !pastDue && plan.apify_enabled && within(u.apify_runs ?? 0, plan.limite_importacoes),
        use_voice_ai: !blocked && plan.voice_ai_enabled,
        use_orbit: !blocked && plan.orbit_enabled,
        use_advanced_analytics: !blocked && plan.advanced_analytics_enabled,
        use_white_label: !blocked && plan.white_label_enabled,
      },
    };
  });

/** SuperAdmin global SaaS overview. */
export const getSaasOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("is_superadmin", { _user_id: userId });
    if (!isSuper) throw new Error("Acesso restrito ao SuperAdmin global");

    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name, plan, status, trial_ends_at, created_at");
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("organization_id, status, plan_code");
    const { data: plans } = await supabase
      .from("organization_plans")
      .select("code, name, monthly_price_cents");

    const periodMonth = new Date();
    periodMonth.setUTCDate(1);
    periodMonth.setUTCHours(0, 0, 0, 0);
    const periodIso = periodMonth.toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("usage_counters" as never)
      .select("organization_id, messages_sent, calls_made, apify_runs")
      .eq("period_month", periodIso);

    const subByOrg = new Map((subs ?? []).map((s) => [s.organization_id, s]));
    const planByCode = new Map((plans ?? []).map((p) => [p.code, p]));
    const usageByOrg = new Map(
      ((usage ?? []) as Array<{ organization_id: string; messages_sent: number; calls_made: number; apify_runs: number }>).map((u) => [u.organization_id, u]),
    );

    const counts = { trial: 0, active: 0, past_due: 0, blocked: 0, expired: 0, canceled: 0 };
    let totalMessages = 0,
      totalCalls = 0,
      totalApify = 0,
      mrrCents = 0;
    const planUsage = new Map<string, number>();

    for (const o of orgs ?? []) {
      const sub = subByOrg.get(o.id);
      const status = (sub?.status ?? o.status) as keyof typeof counts;
      if (status in counts) counts[status]++;
      const planCode = sub?.plan_code ?? o.plan;
      planUsage.set(planCode, (planUsage.get(planCode) ?? 0) + 1);
      const plan = planByCode.get(planCode);
      if (plan && (status === "active" || status === "trial")) {
        mrrCents += plan.monthly_price_cents;
      }
      const u = usageByOrg.get(o.id);
      if (u) {
        totalMessages += u.messages_sent;
        totalCalls += u.calls_made;
        totalApify += u.apify_runs;
      }
    }

    const topPlan = [...planUsage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // organizations near limit (>=80% on any limit)
    const nearLimit: Array<{ id: string; name: string; resource: string; pct: number }> = [];
    for (const o of orgs ?? []) {
      const planCode = subByOrg.get(o.id)?.plan_code ?? o.plan;
      const plan = planByCode.get(planCode);
      const u = usageByOrg.get(o.id);
      if (!plan || !u) continue;
      const checks: Array<[string, number, number]> = [
        ["mensagens", u.messages_sent, (plan as { limite_mensagens?: number }).limite_mensagens ?? -1],
        ["chamadas", u.calls_made, (plan as { max_calls_month?: number }).max_calls_month ?? -1],
        ["apify", u.apify_runs, (plan as { limite_importacoes?: number }).limite_importacoes ?? -1],
      ];
      for (const [resource, used, limit] of checks) {
        if (limit > 0 && used / limit >= 0.8) {
          nearLimit.push({ id: o.id, name: o.name, resource, pct: Math.round((used / limit) * 100) });
        }
      }
    }

    return {
      totalOrgs: orgs?.length ?? 0,
      counts,
      topPlan,
      totalMessages,
      totalCalls,
      totalApify,
      estimatedMrrCents: mrrCents,
      nearLimit,
    };
  });

/** SuperAdmin: change an organization's subscription status. */
export const setOrgSubscriptionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { organizationId: string; status: "trial" | "active" | "past_due" | "canceled" | "blocked" | "expired" }) =>
      z
        .object({
          organizationId: z.string().uuid(),
          status: z.enum(["trial", "active", "past_due", "canceled", "blocked", "expired"]),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("is_superadmin", { _user_id: userId });
    if (!isSuper) throw new Error("Acesso restrito");

    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "canceled") patch.canceled_at = new Date().toISOString();

    const { error: subErr } = await supabase
      .from("subscriptions")
      .update(patch as never)
      .eq("organization_id", data.organizationId);
    if (subErr) throw new Error(subErr.message);

    await supabase
      .from("organizations")
      .update({ status: data.status })
      .eq("id", data.organizationId);

    return { ok: true };
  });