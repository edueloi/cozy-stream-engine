import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Role = "superadmin" | "admin" | "gerente" | "sdr" | "comercial";
const MANAGER_ROLES: Role[] = ["superadmin", "admin", "gerente"];
type AppSupabaseClient = SupabaseClient<Database>;

async function assertManager(ctx: { supabase: AppSupabaseClient; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r) => r.role as Role);
  if (!roles.some((r: Role) => MANAGER_ROLES.includes(r))) {
    throw new Error("Acesso restrito a Superadmin/Gerente.");
  }
  return roles as Role[];
}

async function getCallerOrgId(supabaseAdmin: AppSupabaseClient, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const orgId = data?.organization_id ?? null;
  if (!orgId) throw new Error("Sua conta não está vinculada a uma organização.");
  return orgId as string;
}

async function assertSameOrgForNonSuper(
  supabaseAdmin: AppSupabaseClient,
  callerRoles: Role[],
  callerUserId: string,
  targetUserId: string,
) {
  if (callerRoles.includes("superadmin")) return;
  const callerOrgId = await getCallerOrgId(supabaseAdmin, callerUserId);
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.organization_id !== callerOrgId) {
    throw new Error("Você só pode gerenciar usuários da sua empresa.");
  }
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const callerRoles = await assertManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("profiles")
      .select("id, name, email, created_at, organization_id")
      .order("created_at", { ascending: false });

    if (!callerRoles.includes("superadmin")) {
      const { data: me } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("id", context.userId)
        .maybeSingle();
      const orgId = me?.organization_id ?? null;
      if (!orgId) return [];
      query = query.eq("organization_id", orgId);
    }

    const { data: profiles, error: pErr } = await query;
    if (pErr) throw new Error(pErr.message);

    const profileIds = (profiles ?? []).map((p) => p.id);
    if (profileIds.length === 0) return [];

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", profileIds);
    if (rErr) throw new Error(rErr.message);

    const byUser = new Map<string, Role[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role as Role);
      byUser.set(r.user_id, arr);
    }

    return (profiles ?? []).map((p) => ({
      ...p,
      roles: byUser.get(p.id) ?? [],
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { email: string; password: string; name: string; role: "admin" | "gerente" | "sdr" }) =>
      input,
  )
  .handler(async ({ data, context }) => {
    const callerRoles = await assertManager(context);
    if (!data.email || !data.password || data.password.length < 8) {
      throw new Error("E-mail e senha (mín. 8) são obrigatórios.");
    }
    if (!["admin", "gerente", "sdr"].includes(data.role)) {
      throw new Error("Perfil inválido.");
    }
    if (
      (data.role === "admin" || data.role === "gerente") &&
      !callerRoles.includes("superadmin")
    ) {
      throw new Error("Apenas Superadmin pode criar Admin ou Gerente.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Determinar a organização do novo usuário (org do criador; superadmin não força tenant aqui).
    let targetOrgId: string | null = null;
    if (!callerRoles.includes("superadmin")) {
      targetOrgId = await getCallerOrgId(supabaseAdmin, context.userId);
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar usuário.");

    if (targetOrgId) {
      await supabaseAdmin.from("profiles").upsert({
        id: created.user.id,
        name: data.name,
        email: data.email,
        organization_id: targetOrgId,
      });
    }

    // Garante role correta (handle_new_user cria como 'sdr' por padrão)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: data.role });
    if (rErr) throw new Error(rErr.message);

    return { id: created.user.id };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { userId: string; role: "superadmin" | "admin" | "gerente" | "sdr" }) => input,
  )
  .handler(async ({ data, context }) => {
    const callerRoles = await assertManager(context);
    if (
      ["superadmin", "admin", "gerente"].includes(data.role) &&
      !callerRoles.includes("superadmin")
    ) {
      throw new Error("Apenas Superadmin pode atribuir Superadmin, Admin ou Gerente.");
    }
    if (data.userId === context.userId) {
      throw new Error("Você não pode alterar seu próprio perfil.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSameOrgForNonSuper(supabaseAdmin, callerRoles, context.userId, data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      userId: string;
      name?: string;
      email?: string;
      password?: string;
      role?: "superadmin" | "admin" | "gerente" | "sdr";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const callerRoles = await assertManager(context);
    const isSelf = data.userId === context.userId;
    if (data.password && data.password.length < 8) {
      throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
    }
    if (data.role) {
      if (isSelf) throw new Error("Você não pode alterar seu próprio perfil.");
      if (
        ["superadmin", "admin", "gerente"].includes(data.role) &&
        !callerRoles.includes("superadmin")
      ) {
        throw new Error("Apenas Superadmin pode atribuir Superadmin, Admin ou Gerente.");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSameOrgForNonSuper(supabaseAdmin, callerRoles, context.userId, data.userId);
    const authPatch: { email?: string; password?: string; user_metadata?: { name?: string } } = {};
    if (data.email?.trim()) authPatch.email = data.email.trim();
    if (data.password) authPatch.password = data.password;
    if (data.name !== undefined) authPatch.user_metadata = { name: data.name.trim() };
    if (Object.keys(authPatch).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authPatch);
      if (error) throw new Error(error.message);
    }
    if (data.name !== undefined || data.email !== undefined) {
      const patch: Record<string, string> = {};
      if (data.name !== undefined) patch.name = data.name.trim();
      if (data.email !== undefined) patch.email = data.email.trim();
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(patch as never)
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }
    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    const callerRoles = await assertManager(context);
    if (!callerRoles.includes("superadmin")) {
      throw new Error("Apenas Superadmin pode remover usuários.");
    }
    if (data.userId === context.userId) {
      throw new Error("Você não pode remover a si mesmo.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertSameOrgForNonSuper(supabaseAdmin, callerRoles, context.userId, data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return {
      userId: context.userId,
      roles: (data ?? []).map((r: { role: Role }) => r.role),
    };
  });
