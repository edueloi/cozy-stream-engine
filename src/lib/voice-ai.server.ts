import { createOpenAiCompatibleProvider, getAiApiKey } from "@/lib/ai-gateway";
import { generateText } from "ai";
import { z } from "zod";

export type VoiceTurn = { role: "agent" | "lead"; text: string; ts: string };

export const JCS_DEFAULT_VOICE_CONFIG = {
  voice: "alloy",
  language: "pt-BR",
  tone: "consultivo, simpático, direto",
  speed: 1,
  accent: "neutro",
  greeting:
    "Olá, tudo bem? Aqui é a assistente virtual da JCS Soluções em TI. Estou falando com o responsável pela área de tecnologia ou infraestrutura da empresa?",
  base_script:
    "A JCS ajuda empresas que não podem parar a manter suporte técnico, segurança, backup, firewall e infraestrutura funcionando de forma segura.",
  qualification_questions: [
    "Hoje a empresa possui quantos computadores ou usuários?",
    "Vocês têm TI interno, terceirizado ou alguém da própria empresa cuida disso?",
    "Qual maior dificuldade hoje: suporte, lentidão, backup, segurança, servidor, internet ou chamados?",
    "Quem normalmente decide sobre fornecedores de tecnologia?",
  ],
  objections: [
    {
      pattern: "não tenho interesse",
      reply:
        "Entendo perfeitamente. Só para eu não te incomodar sem necessidade, hoje vocês já possuem alguém cuidando da TI ou preferem não avaliar isso agora?",
    },
    {
      pattern: "já temos TI",
      reply:
        "Perfeito, muitas empresas que atendemos também já tinham alguém cuidando. Normalmente ajudamos como apoio especializado em segurança, backup, firewall, monitoramento ou demandas que o time interno não consegue absorver. Faz sentido entender se existe algum ponto que hoje sobrecarrega vocês?",
    },
    {
      pattern: "manda por e-mail",
      reply:
        "Claro. Para eu mandar algo mais direcionado, hoje vocês possuem mais de 10 computadores ou uma estrutura menor?",
    },
    {
      pattern: "estou sem tempo",
      reply:
        "Sem problemas. Posso te retornar em outro horário ou prefere que eu envie uma mensagem rápida no WhatsApp?",
    },
  ],
  closing_qualified:
    "Ótimo. Vou registrar aqui e encaminhar para um especialista da JCS falar com você. Qual melhor dia e horário para uma conversa rápida de 15 minutos?",
  closing_not_qualified:
    "Perfeito, obrigado pela atenção. Vou registrar aqui para não incomodar vocês com uma abordagem que não faça sentido agora.",
  max_duration_seconds: 360,
  max_attempts: 3,
  retry_interval_minutes: 60 * 24,
};

function getKey() {
  return getAiApiKey();
}

const SummarySchema = z.object({
  summary: z.string(),
  pain: z.string().optional(),
  objections: z.array(z.string()),
  intent: z.enum(["qualified", "not_qualified", "callback", "opt_out", "no_answer"]),
  next_action: z.string(),
  qualification_score: z.number(),
  recommended_product: z.string().optional(),
});

const QualitySchema = z.object({
  opening: z.number(),
  clarity: z.number(),
  investigation: z.number(),
  objection_handling: z.number(),
  commitment: z.number(),
  posture: z.number(),
  overall: z.number(),
});

function transcriptToText(t: VoiceTurn[]) {
  return t.map((x) => `${x.role === "agent" ? "Agente" : "Lead"}: ${x.text}`).join("\n");
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1));
    }
    throw new Error("No JSON found in model response");
  }
}

async function generateJsonObject<T>(schema: z.ZodSchema<T>, system: string, prompt: string): Promise<T> {
  const gateway = createOpenAiCompatibleProvider(getKey());
  const fullSystem = `${system}\n\nResponda APENAS com um objeto JSON válido, sem texto antes ou depois, sem cercas de código \`\`\`.`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: fullSystem,
        prompt,
      });
      const parsed = extractJson(text);
      return schema.parse(parsed);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function summarizeCall(transcript: VoiceTurn[]): Promise<z.infer<typeof SummarySchema>> {
  try {
    return await generateJsonObject(
      SummarySchema,
      "Você é um analista comercial. Avalie a transcrição de uma ligação SDR JCS e produza JSON estruturado em pt-BR com as chaves: summary (string), pain (string opcional), objections (array de strings), intent (qualified|not_qualified|callback|opt_out|no_answer), next_action (string), qualification_score (número 0-100), recommended_product (string opcional).",
      transcriptToText(transcript),
    );
  } catch (err) {
    console.error("[voice-ai] summarizeCall failed", err);
    return {
      summary: "Resumo indisponível (falha na IA).",
      objections: [],
      intent: "no_answer" as const,
      next_action: "Tentar novamente",
      qualification_score: 0,
    };
  }
}

export async function scoreCallQuality(transcript: VoiceTurn[]): Promise<z.infer<typeof QualitySchema>> {
  try {
    return await generateJsonObject(
      QualitySchema,
      "Avalie a performance do SDR de 0 a 10 nas dimensões. Retorne JSON com chaves numéricas: opening, clarity, investigation, objection_handling, commitment, posture, overall (todas de 0 a 10).",
      transcriptToText(transcript),
    );
  } catch (err) {
    console.error("[voice-ai] scoreCallQuality failed", err);
    return { opening: 0, clarity: 0, investigation: 0, objection_handling: 0, commitment: 0, posture: 0, overall: 0 };
  }
}

/** Simulate a full conversation deterministically using AI. Real SIP media bridge will replace this. */
export async function simulateVoiceConversation(opts: {
  agentName: string;
  voiceConfig: typeof JCS_DEFAULT_VOICE_CONFIG;
  leadContext: string;
}): Promise<VoiceTurn[]> {
  const sys = `Você é um SDR de voz da JCS chamado ${opts.agentName}. Conduza uma ligação curta em pt-BR seguindo:
- Saudação: ${opts.voiceConfig.greeting}
- Script base: ${opts.voiceConfig.base_script}
- Faça no máximo 4 perguntas: ${opts.voiceConfig.qualification_questions.join(" | ")}
- Trate objeções comuns.
- Encerramento qualificado: ${opts.voiceConfig.closing_qualified}
- Encerramento não qualificado: ${opts.voiceConfig.closing_not_qualified}

Gere uma transcrição realista turn-a-turn agente/lead. Limite 8-12 turnos.`;
  const TurnsSchema = z.object({
    turns: z
      .array(z.object({ role: z.enum(["agent", "lead"]), text: z.string() })),
  });
  let output: z.infer<typeof TurnsSchema>;
  try {
    output = await generateJsonObject(
      TurnsSchema,
      `${sys}\n\nFormato de saída: JSON com a chave "turns" contendo array de objetos { "role": "agent" | "lead", "text": "..." }.`,
      `Contexto do lead:\n${opts.leadContext}`,
    );
  } catch (err) {
    console.error("[voice-ai] simulateVoiceConversation failed", err);
    throw new Error("A IA não conseguiu gerar a conversa. Tente novamente em instantes.");
  }
  const now = Date.now();
  return output.turns.map((t, i) => ({
    role: t.role,
    text: t.text,
    ts: new Date(now + i * 4000).toISOString(),
  }));
}
