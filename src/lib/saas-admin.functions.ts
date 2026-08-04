import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertSuperadmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito a SuperAdmin.");
}

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organization_plans")
      .select("*")
      .order("monthly_price_cents");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const createOrgSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  plan: z.string().default("starter"),
  status: z.string().default("trial"),
  admin: z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
    })
    .optional(),
});

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => createOrgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.name,
        slug: data.slug,
        plan: data.plan,
        status: data.status,
        trial_ends_at:
          data.status === "trial"
            ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
            : null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("subscriptions").insert({
      organization_id: org.id,
      plan_code: data.plan,
      status: data.status === "trial" ? "trial" : "active",
    });

    if (data.admin) {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.admin.email,
        password: data.admin.password,
        email_confirm: true,
        user_metadata: { name: data.admin.name },
      });
      if (cErr || !created.user) {
        throw new Error(`Organização criada, mas falhou ao criar admin: ${cErr?.message ?? "desconhecido"}`);
      }
      const uid = created.user.id;
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: uid, name: data.admin.name, email: data.admin.email, organization_id: org.id });
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: uid, role: "admin" });
      if (rErr) throw new Error(rErr.message);
    }

    return org;
  });

export const saasGlobalKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

    const [orgs, leads, msgs, calls, agents] = await Promise.all([
      supabaseAdmin.from("organizations").select("id,status,plan,created_at"),
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30),
      supabaseAdmin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30),
      supabaseAdmin.from("ai_agents").select("id", { count: "exact", head: true }),
    ]);

    const orgsList = orgs.data ?? [];
    const ativos = orgsList.filter((o: any) => o.status === "active").length;
    const trial = orgsList.filter((o: any) => o.status === "trial").length;
    const suspensos = orgsList.filter((o: any) => o.status === "suspended").length;

    // MRR aproximado pelo plano de cada org ativa
    const { data: plans } = await supabaseAdmin
      .from("organization_plans")
      .select("code, monthly_price_cents");
    const priceByCode: Record<string, number> = {};
    (plans ?? []).forEach((p: any) => (priceByCode[p.code] = p.monthly_price_cents));
    const mrrCents = orgsList
      .filter((o: any) => o.status === "active")
      .reduce((acc: number, o: any) => acc + (priceByCode[o.plan] ?? 0), 0);

    return {
      totalClientes: orgsList.length,
      ativos,
      trial,
      suspensos,
      mrrCents,
      leads: leads.count ?? 0,
      mensagens30d: msgs.count ?? 0,
      chamadas30d: calls.count ?? 0,
      agentes: agents.count ?? 0,
    };
  });

export const usagePerOrg = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: orgs } = await supabaseAdmin
      .from("organizations")
      .select("id,name,slug,plan,status");
    const result: any[] = [];
    for (const o of orgs ?? []) {
      const [u, l, m, c, a] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", o.id),
        supabaseAdmin
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", o.id),
        supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", o.id)
          .gte("created_at", since30),
        supabaseAdmin
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", o.id)
          .gte("created_at", since30),
        supabaseAdmin
          .from("ai_agents")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", o.id),
      ]);
      result.push({
        ...o,
        usuarios: u.count ?? 0,
        leads: l.count ?? 0,
        mensagens30d: m.count ?? 0,
        chamadas30d: c.count ?? 0,
        agentes: a.count ?? 0,
      });
    }
    return result;
  });

const updateOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  plan: z.string().optional(),
  status: z.string().optional(),
});

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => updateOrgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.plan !== undefined) patch.plan = data.plan;
    if (data.status !== undefined) patch.status = data.status;
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .update(patch as never)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return org;
  });

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Remove usuários vinculados à organização (auth + cascade em profiles/user_roles)
    const { data: members } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("organization_id", data.id);
    for (const m of members ?? []) {
      await supabaseAdmin.auth.admin.deleteUser(m.id).catch(() => {});
    }

    await supabaseAdmin.from("subscriptions").delete().eq("organization_id", data.id);
    const { error } = await supabaseAdmin.from("organizations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });