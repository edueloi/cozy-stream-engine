import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Evaluate a lead's conversation on a given channel and persist the result. */
export const evaluateLeadConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string; channel: "whatsapp" | "email" | "voice" | "sip"; callId?: string }) =>
    z
      .object({
        leadId: z.string().uuid(),
        channel: z.enum(["whatsapp", "email", "voice", "sip"]),
        callId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lead } = await supabase
      .from("leads")
      .select("id, razao_social, nome_fantasia, segmento, agent_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");

    let transcript = "";
    const messageIds: string[] = [];
    let callIdRef: string | null = data.callId ?? null;

    if (data.channel === "voice" || data.channel === "sip") {
      const callQ = supabase
        .from("calls")
        .select("id, voice_transcript, summary, recording_url, agent_id")
        .eq("lead_id", data.leadId)
        .order("created_at", { ascending: false })
        .limit(1);
      const { data: callRows } = data.callId
        ? await supabase
            .from("calls")
            .select("id, voice_transcript, summary, recording_url, agent_id")
            .eq("id", data.callId)
            .limit(1)
        : await callQ;
      const call = (callRows ?? [])[0] as
        | { id: string; voice_transcript: unknown; summary: string | null; agent_id: string | null }
        | undefined;
      if (!call) throw new Error("Chamada não encontrada para este lead");
      callIdRef = call.id;
      const turns = Array.isArray(call.voice_transcript)
        ? (call.voice_transcript as Array<{ role: string; text: string }>)
        : [];
      transcript = turns.length
        ? turns.map((t) => `${t.role === "agent" ? "Agente" : "Lead"}: ${t.text}`).join("\n")
        : (call.summary ?? "");
    } else {
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, direction, channel, subject, body, created_at")
        .eq("lead_id", data.leadId)
        .eq("channel", data.channel)
        .order("created_at", { ascending: true })
        .limit(50);
      const list = msgs ?? [];
      list.forEach((m) => messageIds.push(m.id));
      transcript = list
        .map(
          (m) =>
            `${m.direction === "outbound" ? "Agente" : "Lead"} [${data.channel}]: ${
              m.subject ? `${m.subject} — ` : ""
            }${m.body ?? ""}`,
        )
        .join("\n");
    }

    if (!transcript.trim()) throw new Error("Sem conteúdo suficiente para avaliar");

    const { evaluateConversation } = await import("@/lib/conversation-eval.server");
    const leadContext = `Empresa: ${lead.nome_fantasia ?? lead.razao_social ?? "—"} | Segmento: ${
      lead.segmento ?? "—"
    }`;
    const evalResult = await evaluateConversation({
      channel: data.channel,
      transcript,
      leadContext,
    });

    const { data: orgIdRow } = await supabase.rpc("current_org_id");
    const { data: row, error } = await supabase
      .from("conversation_evaluations" as never)
      .insert({
        organization_id: orgIdRow as unknown as string,
        lead_id: data.leadId,
        agent_id: lead.agent_id ?? null,
        channel: data.channel,
        call_id: callIdRef,
        message_ids: messageIds,
        ...evalResult,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id, ok: true as const };
  });

/** List conversation evaluations for the current org, with optional agent filter. */
export const listEvaluations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { agentId?: string; limit?: number } | undefined) =>
    z
      .object({ agentId: z.string().uuid().optional(), limit: z.number().int().positive().max(500).optional() })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("conversation_evaluations" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.agentId) q = q.eq("agent_id", data.agentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Save human feedback on an evaluation. */
export const setHumanFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { evaluationId: string; feedback: "boa" | "media" | "ruim"; reason?: string }) =>
      z
        .object({
          evaluationId: z.string().uuid(),
          feedback: z.enum(["boa", "media", "ruim"]),
          reason: z.string().max(500).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("conversation_evaluations" as never)
      .update({
        human_feedback: data.feedback,
        human_feedback_reason: data.reason ?? null,
        human_feedback_by: userId,
        human_feedback_at: new Date().toISOString(),
      } as never)
      .eq("id", data.evaluationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Aggregated metrics per agent for the optimization dashboard. */
export const getAgentOptimizationOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: agents } = await supabase
      .from("ai_agents")
      .select("id, name")
      .eq("active", true);
    const { data: evals } = await supabase
      .from("conversation_evaluations" as never)
      .select("agent_id, channel, overall_score, detected_objections, lead_temperature, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);
    const list = (evals ?? []) as Array<{
      agent_id: string | null;
      channel: string;
      overall_score: number | null;
      detected_objections: string[] | null;
      lead_temperature: string | null;
    }>;

    const byAgent = new Map<string, { count: number; sum: number; objections: Map<string, number>; channels: Map<string, { sum: number; count: number }>; hot: number }>();
    for (const e of list) {
      if (!e.agent_id) continue;
      const a = byAgent.get(e.agent_id) ?? {
        count: 0,
        sum: 0,
        objections: new Map(),
        channels: new Map(),
        hot: 0,
      };
      a.count += 1;
      a.sum += Number(e.overall_score ?? 0);
      for (const o of e.detected_objections ?? []) a.objections.set(o, (a.objections.get(o) ?? 0) + 1);
      const ch = a.channels.get(e.channel) ?? { sum: 0, count: 0 };
      ch.sum += Number(e.overall_score ?? 0);
      ch.count += 1;
      a.channels.set(e.channel, ch);
      if (e.lead_temperature === "quente" || e.lead_temperature === "quentíssimo") a.hot += 1;
      byAgent.set(e.agent_id, a);
    }

    return (agents ?? []).map((a) => {
      const m = byAgent.get(a.id);
      const avg = m && m.count ? Number((m.sum / m.count).toFixed(2)) : null;
      const topObjections = m
        ? [...m.objections.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ objection: k, count: v }))
        : [];
      const channels = m
        ? [...m.channels.entries()].map(([k, v]) => ({ channel: k, avg: Number((v.sum / Math.max(1, v.count)).toFixed(2)), count: v.count }))
        : [];
      return {
        agentId: a.id,
        name: a.name,
        evaluations: m?.count ?? 0,
        avgScore: avg,
        hotLeads: m?.hot ?? 0,
        topObjections,
        channels,
      };
    });
  });

/** Generate AI suggestions for an agent based on its recent evaluations (>=10). */
export const generateAgentOptimizationSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { agentId: string }) =>
    z.object({ agentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: agent } = await supabase
      .from("ai_agents")
      .select("id, name")
      .eq("id", data.agentId)
      .maybeSingle();
    if (!agent) throw new Error("Agente não encontrado");

    const { data: rows } = await supabase
      .from("conversation_evaluations" as never)
      .select("overall_score, weaknesses, detected_objections, improvement_suggestions")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false })
      .limit(80);
    const evaluations = (rows ?? []) as Array<{
      overall_score: number;
      weaknesses: string[] | null;
      detected_objections: string[] | null;
      improvement_suggestions: string[] | null;
    }>;
    if (evaluations.length < 5) throw new Error("Menos de 5 avaliações ainda — colete mais conversas antes.");

    const { generateAgentSuggestions } = await import("@/lib/conversation-eval.server");
    const suggestions = await generateAgentSuggestions({
      agentName: agent.name,
      evaluations: evaluations.map((e) => ({
        overall_score: Number(e.overall_score),
        weaknesses: e.weaknesses ?? [],
        detected_objections: e.detected_objections ?? [],
        improvement_suggestions: e.improvement_suggestions ?? [],
      })),
    });

    const { data: orgIdRow } = await supabase.rpc("current_org_id");
    const inserts = suggestions.map((s) => ({
      organization_id: orgIdRow as unknown as string,
      agent_id: data.agentId,
      suggestion_type: s.type,
      suggestion_text: s.text,
      rationale: s.rationale,
      based_on_count: evaluations.length,
      status: "pending",
    }));
    if (inserts.length) {
      await supabase.from("agent_optimization_suggestions" as never).insert(inserts as never);
    }
    return { created: inserts.length };
  });

/** List pending/applied suggestions for an agent. */
export const listAgentSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { agentId: string }) =>
    z.object({ agentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("agent_optimization_suggestions" as never)
      .select("*")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Mark a suggestion applied or dismissed. Does NOT modify the agent prompt automatically. */
export const updateSuggestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { suggestionId: string; status: "applied" | "dismissed" }) =>
    z.object({ suggestionId: z.string().uuid(), status: z.enum(["applied", "dismissed"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "applied") {
      patch.applied_by = userId;
      patch.applied_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("agent_optimization_suggestions" as never)
      .update(patch as never)
      .eq("id", data.suggestionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A/B comparison across cadence_variants per (day, channel). */
export const getVariantComparison = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase
      .from("cadence_variants")
      .select("cadence_day, channel, variant_key, sent_count, reply_count, positive_count");
    const list = rows ?? [];
    const groups = new Map<string, typeof list>();
    for (const r of list) {
      const k = `${r.cadence_day}|${r.channel}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const out: Array<{
      day: number;
      channel: string;
      variants: Array<{ key: string; sent: number; reply_rate: number; positive_rate: number }>;
      recommendation: string | null;
    }> = [];
    for (const [k, vs] of groups) {
      if (vs.length < 2) continue;
      const [dayStr, channel] = k.split("|");
      const variants = vs.map((v) => ({
        key: v.variant_key,
        sent: v.sent_count ?? 0,
        reply_rate: v.sent_count ? (v.reply_count ?? 0) / v.sent_count : 0,
        positive_rate: v.sent_count ? (v.positive_count ?? 0) / v.sent_count : 0,
      }));
      const sorted = [...variants].sort((a, b) => b.positive_rate - a.positive_rate);
      const winner = sorted[0];
      const runnerUp = sorted[1];
      const lift =
        runnerUp && runnerUp.positive_rate > 0
          ? ((winner.positive_rate - runnerUp.positive_rate) / runnerUp.positive_rate) * 100
          : 0;
      const recommendation =
        winner.sent >= 20 && lift > 5
          ? `Variante ${winner.key.toUpperCase()} está performando ${lift.toFixed(0)}% melhor que ${runnerUp!.key.toUpperCase()}.`
          : null;
      out.push({ day: Number(dayStr), channel, variants, recommendation });
    }
    return out;
  });