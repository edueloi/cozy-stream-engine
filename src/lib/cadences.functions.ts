import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendCadenceStep } from "./outreach.functions";

const CATEGORIES = [
  "Serviços",
  "Produtos",
  "Software",
  "Cibersegurança",
  "Reativação",
  "Inbound",
  "Outbound",
  "Pós-Proposta",
  "Cliente Ativo",
  "Personalizada",
] as const;

export const CADENCE_CATEGORIES = CATEGORIES;

export const listCadences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cadences")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // counts of variants and active leads per cadence
    const ids = (data ?? []).map((c) => c.id);
    let counts: Record<string, { steps: number; active_leads: number }> = {};
    if (ids.length > 0) {
      const [{ data: vs }, { data: ls }] = await Promise.all([
        context.supabase.from("cadence_variants").select("cadence_id").in("cadence_id", ids),
        context.supabase.from("leads").select("active_cadence_id, cadence_status").in("active_cadence_id", ids),
      ]);
      for (const id of ids) counts[id] = { steps: 0, active_leads: 0 };
      for (const v of vs ?? []) if (v.cadence_id) counts[v.cadence_id].steps++;
      for (const l of ls ?? [])
        if (l.active_cadence_id && l.cadence_status === "active") counts[l.active_cadence_id].active_leads++;
    }
    return { items: (data ?? []).map((c) => ({ ...c, ...counts[c.id] })) };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(CATEGORIES).default("Personalizada"),
  objective: z.string().max(500).optional().nullable(),
  status: z.enum(["active", "paused", "draft"]).default("active"),
});

export const upsertCadence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof upsertSchema>) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("cadences").update(rest as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: ins, error } = await context.supabase
      .from("cadences")
      .insert({ ...rest, created_by: context.userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const setCadenceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; status: "active" | "paused" | "draft" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "draft"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cadences")
      .update({ status: data.status } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateCadence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: se } = await context.supabase
      .from("cadences")
      .select("*")
      .eq("id", data.id)
      .single();
    if (se) throw new Error(se.message);
    const { data: ins, error } = await context.supabase
      .from("cadences")
      .insert({
        organization_id: src.organization_id,
        name: `${src.name} (cópia)`,
        description: src.description,
        category: src.category,
        objective: src.objective,
        status: "draft",
        is_default: false,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // copy variants
    const { data: vs } = await context.supabase
      .from("cadence_variants")
      .select("cadence_day, channel, variant_key, subject, body_template, weight, active, organization_id")
      .eq("cadence_id", data.id);
    if (vs && vs.length > 0) {
      const rows = vs.map((v) => ({ ...v, cadence_id: ins.id }));
      await context.supabase.from("cadence_variants").insert(rows as never);
    }
    return { id: ins.id };
  });

export const startCadenceForLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      leadIds: string[];
      cadenceId: string;
      agentId?: string | null;
      forceReplace?: boolean;
    }) =>
      z
        .object({
          leadIds: z.array(z.string().uuid()).min(1).max(500),
          cadenceId: z.string().uuid(),
          agentId: z.string().uuid().nullable().optional(),
          forceReplace: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Conflict check: leads with active cadence different from chosen one
    const { data: leads, error: le } = await context.supabase
      .from("leads")
      .select("id, agent_id, opt_out, ai_paused, active_cadence_id, cadence_status")
      .in("id", data.leadIds);
    if (le) throw new Error(le.message);
    const conflicting = (leads ?? []).filter(
      (l) =>
        l.active_cadence_id &&
        l.active_cadence_id !== data.cadenceId &&
        l.cadence_status === "active",
    );
    if (conflicting.length > 0 && !data.forceReplace) {
      return { needsConfirmation: true, conflicting: conflicting.length };
    }

    const patch: Record<string, unknown> = {
      active_cadence_id: data.cadenceId,
      cadence_status: "active",
      cadence_started_at: new Date().toISOString(),
      cadence_current_day: 0,
      cadence_day: 0,
      cadence_paused: false,
      ai_paused: false,
      ai_paused_at: null,
      opt_out: false,
      opt_out_at: null,
      opt_out_reason: null,
      needs_human: false,
      human_reason: null,
      human_flagged_at: null,
      handoff_reason: null,
      handoff_at: null,
      status: "em_cadencia",
    };
    if (data.agentId !== undefined) patch.agent_id = data.agentId;

    const { error: ue } = await context.supabase
      .from("leads")
      .update(patch as never)
      .in("id", data.leadIds);
    if (ue) throw new Error(ue.message);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const targets = (leads ?? []).slice(0, 50);
    // Espaçamento mínimo de 20s entre envios do lote — reduz risco de ban
    // e distribui a carga sem depender exclusivamente do cron.
    const STAGGER_MS = 20_000;
    for (let i = 0; i < targets.length; i++) {
      const lead = targets[i];
      const agentForLead = data.agentId ?? lead.agent_id;
      if (!agentForLead) {
        failed++;
        errors.push("Lead sem agente atribuído");
        continue;
      }
      try {
        await sendCadenceStep(context.supabase, lead.id, undefined, {
          bypassSchedule: true,
          forceStart: true,
          skipMinInterval: true,
        });
        sent++;
        if (i < targets.length - 1) {
          await new Promise((r) => setTimeout(r, STAGGER_MS));
        }
      } catch (e) {
        failed++;
        errors.push((e as Error).message);
      }
    }
    return { ok: true, updated: data.leadIds.length, sent, failed, errors: errors.slice(0, 5) };
  });

export const stopCadenceForLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { leadIds: string[] }) =>
    z.object({ leadIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ cadence_status: "stopped", cadence_paused: true } as never)
      .in("id", data.leadIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });