import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { kind?: string; q?: string; category?: string; favoritesOnly?: boolean; jcsOnly?: boolean } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("marketplace_templates").select("*").eq("published", true);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.category) q = q.eq("category", data.category);
    if (data.jcsOnly) q = q.eq("is_jcs_official", true);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q.order("install_count", { ascending: false }).limit(200);
    if (error) throw error;

    const { data: favs } = await context.supabase
      .from("marketplace_favorites")
      .select("template_id")
      .eq("user_id", context.userId);
    const favSet = new Set((favs ?? []).map((f: any) => f.template_id));
    let list = (rows ?? []).map((r: any) => ({ ...r, is_favorite: favSet.has(r.id) }));
    if (data.favoritesOnly) list = list.filter((r) => r.is_favorite);
    return list;
  });

export const installTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ template_id: z.string().uuid(), customName: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", userId).single();
    const orgId = prof?.organization_id;
    if (!orgId) throw new Error("Sem organização");

    const { data: tpl, error: tplErr } = await supabase
      .from("marketplace_templates").select("*").eq("id", data.template_id).single();
    if (tplErr || !tpl) throw tplErr ?? new Error("Template não encontrado");

    const result: Record<string, any> = {};
    const tplAny = tpl as any;
    const payload = (tplAny.payload ?? {}) as any;

    async function installAgent(p: any, name: string): Promise<string> {
      const { data: ag, error } = await supabase.from("ai_agents").insert({
        organization_id: orgId,
        name,
        description: tplAny.description,
        master_prompt: p.master_prompt ?? "",
        rules_can: p.rules_can ?? [],
        rules_cannot: p.rules_cannot ?? [],
        active: true,
      } as any).select("id").single();
      if (error) throw error;
      return (ag as any).id as string;
    }

    if (tplAny.kind === "agent") {
      result.agent_id = await installAgent(payload, data.customName ?? tplAny.name);
    } else if (tplAny.kind === "cadence") {
      result.cadence = payload;
    } else if (tplAny.kind === "package") {
      if (payload.agent_slug) {
        const { data: ag } = await supabase
          .from("marketplace_templates").select("*").eq("slug", payload.agent_slug).eq("kind", "agent").single();
        if (ag) result.agent_id = await installAgent((ag as any).payload ?? {}, data.customName ?? (ag as any).name);
      }
      if (payload.cadence_slug) {
        const { data: c } = await supabase
          .from("marketplace_templates").select("payload").eq("slug", payload.cadence_slug).eq("kind", "cadence").single();
        if (c) result.cadence = (c as any).payload;
      }
    }

    await supabase.from("marketplace_installations").insert({
      template_id: tplAny.id, organization_id: orgId, installed_by: userId, result: result as any,
    } as any);
    await supabase.from("marketplace_templates")
      .update({ install_count: (tplAny.install_count ?? 0) + 1 } as any).eq("id", tplAny.id);

    return { ok: true as const, result: result as Record<string, any> };
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ template_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("marketplace_favorites").select("id").eq("template_id", data.template_id).eq("user_id", userId).maybeSingle();
    if (existing) {
      await supabase.from("marketplace_favorites").delete().eq("id", existing.id);
      return { favorited: false };
    }
    await supabase.from("marketplace_favorites").insert({ template_id: data.template_id, user_id: userId });
    return { favorited: true };
  });

export const rateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ template_id: z.string().uuid(), stars: z.number().int().min(1).max(5), comment: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("organization_id").eq("id", userId).single();
    await supabase.from("marketplace_ratings").upsert({
      template_id: data.template_id, user_id: userId, organization_id: prof?.organization_id ?? null,
      stars: data.stars, comment: data.comment ?? null,
    }, { onConflict: "template_id,user_id" });

    const { data: agg } = await supabase.from("marketplace_ratings")
      .select("stars").eq("template_id", data.template_id);
    const arr = (agg ?? []).map((r: any) => r.stars);
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    await supabase.from("marketplace_templates")
      .update({ avg_rating: Number(avg.toFixed(2)), rating_count: arr.length }).eq("id", data.template_id);
    return { ok: true };
  });

export const marketplaceStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ count: installed }, { data: top }] = await Promise.all([
      supabase.from("marketplace_installations").select("id", { count: "exact", head: true }),
      supabase.from("marketplace_templates").select("id,name,install_count,avg_rating,kind")
        .order("install_count", { ascending: false }).limit(5),
    ]);
    return { installed: installed ?? 0, top: top ?? [] };
  });