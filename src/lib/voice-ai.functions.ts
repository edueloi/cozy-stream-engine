import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Start a voice AI call: creates a `calls` row, runs the AI conversation, persists transcript/summary/scores. */
export const startVoiceCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { leadId: string; agentId: string }) =>
    z.object({ leadId: z.string().uuid(), agentId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, razao_social, nome_fantasia, segmento, cidade, telefone")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead não encontrado");

    const { data: agent, error: agErr } = await supabase
      .from("ai_agents")
      .select("id, name, voice_enabled, voice_config")
      .eq("id", data.agentId)
      .maybeSingle();
    if (agErr) throw new Error(agErr.message);
    if (!agent) throw new Error("Agente não encontrado");
    if (!agent.voice_enabled) throw new Error("Agente sem voz habilitada");

    const { data: callRow, error: callErr } = await supabase
      .from("calls")
      .insert({
        lead_id: data.leadId,
        agent_id: data.agentId,
        call_type: "ai_voice",
        call_status: "calling",
        direction: "outbound",
        status: "ringing",
      } as never)
      .select("id")
      .single();
    if (callErr) throw new Error(callErr.message);
    const callId = (callRow as { id: string }).id;

    try {
      const { JCS_DEFAULT_VOICE_CONFIG, simulateVoiceConversation, summarizeCall, scoreCallQuality } =
        await import("@/lib/voice-ai.server");

      const cfg = { ...JCS_DEFAULT_VOICE_CONFIG, ...((agent.voice_config as object) ?? {}) };
      const leadContext = [
        `Empresa: ${lead.nome_fantasia ?? lead.razao_social ?? "—"}`,
        `Segmento: ${lead.segmento ?? "—"}`,
        `Cidade: ${lead.cidade ?? "—"}`,
        `Telefone: ${lead.telefone ?? "—"}`,
      ].join("\n");

      const transcript = await simulateVoiceConversation({
        agentName: agent.name,
        voiceConfig: cfg as never,
        leadContext,
      });
      const [summary, quality] = await Promise.all([summarizeCall(transcript), scoreCallQuality(transcript)]);

      // SIMULAÇÃO: nenhuma ligação real ocorreu. Não classificamos o lead nem
      // sincronizamos com Orbit a partir de uma simulação para evitar dados falsos.
      const finalStatus = "simulated" as const;

      const durationSeconds = transcript.length * 4;

      await supabase
        .from("calls")
        .update({
          call_status: finalStatus,
          status: "ended",
          ended_at: new Date().toISOString(),
          voice_transcript: transcript as never,
          summary: `[SIMULAÇÃO — sem ligação real] ${summary.summary}`,
          qualification_score: Math.round(summary.qualification_score),
          intent: summary.intent,
          objections_detected: summary.objections,
          next_action: summary.next_action,
          duration_seconds: durationSeconds,
          duration_sec: durationSeconds,
          call_quality_score: quality.overall,
        } as never)
        .eq("id", callId);

      // Simulação não altera status do lead, não pausa cadência e não cria
      // oportunidade em Orbit. Para ligar de verdade é preciso integrar telefonia
      // (Twilio + ElevenLabs Conversational AI sobre SIP).

      await supabase.from("activity_events").insert({
        lead_id: data.leadId,
        kind: "voice_call_simulated",
        payload: { call_id: callId, intent: summary.intent, score: summary.qualification_score, simulated: true } as never,
      } as never);

      return { callId, status: finalStatus, summary: summary.summary };
    } catch (e) {
      await supabase
        .from("calls")
        .update({
          call_status: "failed",
          status: "failed",
          ended_at: new Date().toISOString(),
          summary: (e as Error).message,
        } as never)
        .eq("id", callId);
      throw e;
    }
  });

export const listVoiceCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calls")
      .select(
        "id, created_at, lead_id, agent_id, call_status, qualification_score, call_quality_score, intent, summary, duration_seconds, leads(razao_social, nome_fantasia), ai_agents(name)",
      )
      .eq("call_type", "ai_voice")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getVoiceCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("calls")
      .select("*, leads(razao_social, nome_fantasia), ai_agents(name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const getVoiceDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calls")
      .select("call_status, qualification_score, call_quality_score, duration_seconds, objections_detected, agent_id")
      .eq("call_type", "ai_voice");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const count = (s: string) => rows.filter((r) => r.call_status === s).length;
    const total = rows.length;
    const qualified = count("qualified");
    const objCounts: Record<string, number> = {};
    for (const r of rows) {
      const arr = (r.objections_detected as string[] | null) ?? [];
      for (const o of arr) objCounts[o] = (objCounts[o] ?? 0) + 1;
    }
    const topObjections = Object.entries(objCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => ({ objection: k, count: v }));
    const avgDur =
      rows.length === 0
        ? 0
        : Math.round(rows.reduce((s, r) => s + ((r.duration_seconds as number) ?? 0), 0) / rows.length);
    return {
      total,
      answered: count("qualified") + count("not_qualified") + count("callback_requested"),
      no_answer: count("no_answer"),
      busy: count("busy"),
      failed: count("failed"),
      qualified,
      conversion: total > 0 ? Math.round((qualified / total) * 100) : 0,
      avgDurationSec: avgDur,
      topObjections,
    };
  });

const VoiceConfigSchema = z
  .object({
    voice: z.string().optional(),
    language: z.string().optional(),
    tone: z.string().optional(),
    speed: z.number().optional(),
    accent: z.string().optional(),
    greeting: z.string().optional(),
    base_script: z.string().optional(),
    qualification_questions: z.array(z.string()).optional(),
    objections: z.array(z.object({ pattern: z.string(), reply: z.string() })).optional(),
    closing_qualified: z.string().optional(),
    closing_not_qualified: z.string().optional(),
    max_duration_seconds: z.number().optional(),
    max_attempts: z.number().optional(),
    retry_interval_minutes: z.number().optional(),
  })
  .passthrough();

export const updateAgentVoiceConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { agentId: string; voiceEnabled: boolean; config: z.infer<typeof VoiceConfigSchema> }) =>
      z
        .object({
          agentId: z.string().uuid(),
          voiceEnabled: z.boolean(),
          config: VoiceConfigSchema,
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_agents")
      .update({ voice_enabled: data.voiceEnabled, voice_config: data.config as never } as never)
      .eq("id", data.agentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listVoiceAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_agents")
      .select("id, name, voice_enabled, voice_config")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listLeadsForVoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("id, razao_social, nome_fantasia, telefone, status")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });