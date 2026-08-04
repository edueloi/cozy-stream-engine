import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createOpenAiCompatibleProvider, getAiApiKey } from "@/lib/ai-gateway";

const BANT_SYSTEM = `Você é um analista de qualificação de leads B2B. Extraia BANT (Budget, Authority, Need, Timing) das mensagens trocadas com o lead.
Responda apenas em JSON. Use null quando não houver evidência clara. Seja conservador.`;

const schema = z.object({ leadId: z.string().uuid() });

export const extractBant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof schema>) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msgs, error } = await supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    if (!msgs || msgs.length === 0) throw new Error("Sem mensagens para analisar.");

    const transcript = msgs
      .map((m) => `${m.direction === "inbound" ? "Lead" : "SDR"}: ${m.body ?? ""}`)
      .join("\n");

    const key = getAiApiKey();
    const gateway = createOpenAiCompatibleProvider(key);
    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: BANT_SYSTEM,
      prompt: `Conversa:\n"""${transcript.slice(-6000)}"""\n\nExtraia BANT.`,
      output: Output.object({
        schema: z.object({
          budget: z.string().nullable(),
          authority: z.string().nullable(),
          need: z.string().nullable(),
          timing: z.string().nullable(),
        }),
      }),
    });
    const out = output;
    const filled = [out.budget, out.authority, out.need, out.timing].filter(Boolean).length;
    const qualScore = Math.round((filled / 4) * 100);

    const patch: Record<string, unknown> = {
      qual_budget: out.budget,
      qual_authority: out.authority,
      qual_need: out.need,
      qual_timing: out.timing,
      qual_score: qualScore,
    };
    if (qualScore >= 75) patch.status = "qualificado";
    await supabase.from("leads").update(patch as never).eq("id", data.leadId);

    const rows = [
      { field: "budget", value: out.budget },
      { field: "authority", value: out.authority },
      { field: "need", value: out.need },
      { field: "timing", value: out.timing },
    ]
      .filter((r) => r.value)
      .map((r) => ({ lead_id: data.leadId, field: r.field, value: r.value!, source: "ai" }));
    if (rows.length) await supabase.from("qualification_answers").insert(rows as never);

    await supabase.from("activity_events").insert({
      lead_id: data.leadId,
      type: "bant_extracted",
      payload: { qual_score: qualScore, by: userId } as never,
    });

    return { ok: true, qualScore, bant: out };
  });

const toggleSchema = z.object({ leadId: z.string().uuid(), paused: z.boolean() });
export const setAiPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof toggleSchema>) => toggleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      ai_paused: data.paused,
      ai_paused_at: data.paused ? new Date().toISOString() : null,
    };
    if (!data.paused) {
      // Ao reativar IA manualmente, destrave TODOS os flags que impedem a conversa/cadência.
      patch.handoff_reason = null;
      patch.handoff_at = null;
      patch.needs_human = false;
      patch.human_reason = null;
      patch.human_flagged_at = null;
      patch.cadence_paused = false;
      patch.cadence_status = "active";
      patch.opt_out = false;
      patch.opt_out_at = null;
      patch.opt_out_reason = null;
      // Se o lead ficou preso em needs_human/descartado, devolva para cadência.
      const { data: cur } = await context.supabase
        .from("leads")
        .select("status")
        .eq("id", data.leadId)
        .maybeSingle();
      const s = (cur as { status?: string } | null)?.status;
      if (s === "needs_human" || s === "descartado" || s === "inbound_in_progress") {
        patch.status = "em_cadencia";
      }
    }
    const { error } = await context.supabase
      .from("leads")
      .update(patch as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    if (!data.paused) {
      await context.supabase.from("activity_events").insert({
        lead_id: data.leadId,
        type: "ai_reactivated",
        payload: { cleared_opt_out: true, resumed_cadence: true } as never,
      });
    }
    return { ok: true };
  });

// ============= Qualificação Manual (vendedor) =============

const QUAL_STATUSES = [
  "nao_qualificado",
  "em_qualificacao",
  "qualificado",
  "sem_perfil",
  "precisa_humano",
  "reuniao_agendada",
  "perdido",
] as const;

const manualQualSchema = z.object({
  leadId: z.string().uuid(),
  by: z.enum(["ia", "vendedor"]).default("vendedor"),
  patch: z.object({
    qual_computers_count: z.coerce.number().int().nullish(),
    qual_has_internal_it: z.boolean().nullish(),
    qual_has_outsourced_it: z.boolean().nullish(),
    qual_main_pain: z.string().nullish(),
    qual_decision_maker: z.string().nullish(),
    qual_decision_role: z.string().nullish(),
    qual_interest: z.string().nullish(),
    qual_urgency: z.string().nullish(),
    qual_estimated_budget: z.string().nullish(),
    qual_next_step: z.string().nullish(),
    qual_seller_notes: z.string().nullish(),
    qual_manual_score: z.coerce.number().int().min(0).max(100).nullish(),
    qual_status: z.enum(QUAL_STATUSES).nullish(),
    qual_lost_reason: z.string().nullish(),
  }),
});

export const updateLeadQualification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof manualQualSchema>) => manualQualSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: current, error: readErr } = await supabase
      .from("leads")
      .select("qual_ai_touched, qual_human_touched, qual_status, cadence_paused")
      .eq("id", data.leadId)
      .single();
    if (readErr) throw new Error(readErr.message);

    if (data.patch.qual_status === "perdido" && !(data.patch.qual_lost_reason ?? "").trim()) {
      throw new Error("Motivo obrigatório para marcar como perdido.");
    }

    const now = new Date().toISOString();
    const human = data.by === "vendedor";
    const aiTouched = current?.qual_ai_touched || data.by === "ia";
    const humanTouched = current?.qual_human_touched || human;
    const updatedBy =
      aiTouched && humanTouched ? "ambos" : humanTouched ? "vendedor" : "ia";

    const patch: Record<string, unknown> = {
      ...data.patch,
      qual_updated_by: updatedBy,
      qual_updated_at: now,
      qual_ai_touched: aiTouched,
      qual_human_touched: humanTouched,
    };

    // Regras de status
    if (data.patch.qual_status === "sem_perfil") {
      patch.cadence_paused = true;
      patch.status = "descartado";
    }
    if (data.patch.qual_status === "qualificado") {
      patch.status = "qualificado";
    }
    if (data.patch.qual_status === "reuniao_agendada") {
      patch.status = "reuniao";
    }
    if (data.patch.qual_status === "perdido") {
      patch.status = "descartado";
      patch.cadence_paused = true;
    }

    const { error } = await supabase
      .from("leads")
      .update(patch as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    if (human) {
      await supabase.from("activity_events").insert({
        lead_id: data.leadId,
        type: "manual_qualification_updated",
        payload: {
          by: userId,
          changes: data.patch,
          new_status: data.patch.qual_status ?? current?.qual_status ?? null,
        } as never,
      });
    }

    return { ok: true, updatedBy };
  });

const optOutSchema = z.object({ leadId: z.string().uuid(), reason: z.string().optional() });
export const setOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.infer<typeof optOutSchema>) => optOutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({
        opt_out: true,
        opt_out_at: new Date().toISOString(),
        opt_out_reason: data.reason ?? "Manual",
        cadence_paused: true,
        ai_paused: true,
        status: "descartado",
      } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
