import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getOrgId(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("current_org_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Organização não encontrada para o usuário.");
  return data as string;
}

export const getApifyConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("organization_integrations")
      .select("active, updated_at")
      .eq("organization_id", orgId)
      .eq("provider", "apify")
      .maybeSingle();
    return { configured: !!data, active: data?.active ?? false, updated_at: data?.updated_at ?? null };
  });

export const setApifyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { token: string }) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("organization_integrations").upsert(
      {
        organization_id: orgId,
        provider: "apify",
        config: { token: data.token },
        active: true,
      },
      { onConflict: "organization_id,provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearApifyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("organization_integrations")
      .delete()
      .eq("organization_id", orgId)
      .eq("provider", "apify");
    return { ok: true };
  });

export async function getApifyTokenForOrg(orgId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("organization_integrations")
    .select("config, active")
    .eq("organization_id", orgId)
    .eq("provider", "apify")
    .maybeSingle();
  if (!data || !data.active) return null;
  const cfg = (data.config as any) ?? {};
  return cfg.token ?? null;
}