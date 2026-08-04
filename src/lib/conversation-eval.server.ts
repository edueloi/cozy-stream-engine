import { createOpenAiCompatibleProvider, getAiApiKey } from "@/lib/ai-gateway";
import { generateText, Output } from "ai";
import { z } from "zod";

function getKey() {
  return getAiApiKey();
}

const EvalSchema = z.object({
  opening_score: z.number(),
  investigation_score: z.number(),
  objection_handling_score: z.number(),
  value_proposition_score: z.number(),
  commitment_score: z.number(),
  behavior_score: z.number(),
  overall_score: z.number(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  improvement_suggestions: z.array(z.string()),
  detected_objections: z.array(z.string()),
  detected_intent: z.string(),
  lead_temperature: z.enum(["frio", "morno", "quente", "quentíssimo"]),
  recommended_next_action: z.string(),
});

export type ConversationEvaluation = z.infer<typeof EvalSchema>;

export async function evaluateConversation(opts: {
  channel: "whatsapp" | "email" | "voice" | "sip";
  transcript: string;
  leadContext?: string;
}): Promise<ConversationEvaluation> {
  const gateway = createOpenAiCompatibleProvider(getKey());
  const { output } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    output: Output.object({ schema: EvalSchema }),
    system: `Você é um analista comercial sênior. Avalie a conversa de SDR no canal ${opts.channel}.
Pontue de 0 a 10 cada dimensão e produza JSON estruturado em pt-BR.
lead_temperature deve ser uma de: frio, morno, quente, quentíssimo.`,
    prompt: `${opts.leadContext ? `Contexto do lead:\n${opts.leadContext}\n\n` : ""}Transcrição:\n${opts.transcript}`,
  });
  return output;
}

const SuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      type: z.enum([
        "saudacao",
        "qualificacao",
        "objecao",
        "tamanho_mensagem",
        "cta",
        "tom_voz",
        "outro",
      ]),
      text: z.string(),
      rationale: z.string(),
    }),
  ),
});

export type GeneratedSuggestion = z.infer<typeof SuggestionsSchema>["suggestions"][number];

export async function generateAgentSuggestions(opts: {
  agentName: string;
  evaluations: Array<{
    overall_score: number;
    weaknesses: string[];
    detected_objections: string[];
    improvement_suggestions: string[];
  }>;
}): Promise<GeneratedSuggestion[]> {
  const gateway = createOpenAiCompatibleProvider(getKey());
  const summary = opts.evaluations
    .slice(0, 80)
    .map(
      (e, i) =>
        `#${i + 1} score=${e.overall_score} | fraquezas: ${e.weaknesses.join(", ")} | objeções: ${e.detected_objections.join(", ")} | sugestões: ${e.improvement_suggestions.join(", ")}`,
    )
    .join("\n");
  const { output } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    output: Output.object({ schema: SuggestionsSchema }),
    system:
      "Você otimiza prompts de SDR. Gere de 3 a 6 sugestões acionáveis para melhorar o agente, em pt-BR. Cada sugestão deve ser concreta e curta.",
    prompt: `Agente: ${opts.agentName}\nAvaliações recentes (até 80):\n${summary}`,
  });
  return output.suggestions;
}
