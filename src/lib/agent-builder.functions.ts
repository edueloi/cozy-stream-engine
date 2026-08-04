import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const WizardSchema = z.object({
  goal: z.string().min(1),
  channel: z.enum(["whatsapp", "email", "voice", "webchat", "multicanal"]),
  audience: z.enum(["b2b", "b2c"]),
  icp: z.string().min(1),
  products: z.string().min(1),
  objections: z.string().optional().default(""),
  personality: z.enum(["formal", "consultiva", "tecnica", "comercial", "amigavel", "executiva"]),
  handoff_rules: z.string().optional().default(""),
  use_knowledge: z.boolean().default(false),
  create_cadence: z.boolean().default(false),
});

export type AgentBuilderWizard = z.infer<typeof WizardSchema>;

const SpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  master_prompt: z.string(),
  initial_greeting: z.string(),
  rules_can: z.array(z.string()),
  rules_cannot: z.array(z.string()),
  qualification_criteria: z.array(z.string()),
  disqualification_criteria: z.array(z.string()),
  objections: z.array(z.object({ objection: z.string(), response: z.string() })),
  authority_arguments: z.array(z.string()),
  initial_messages: z.object({
    whatsapp: z.string(),
    email: z.object({ subject: z.string(), body: z.string() }),
    voice: z.string(),
  }),
  cadence: z.array(
    z.object({
      day: z.number(),
      channel: z.enum(["whatsapp", "email", "voice"]),
      message: z.string(),
    }),
  ),
  kpis: z.object({
    target_response_rate: z.number(),
    target_qualification_rate: z.number(),
    target_meeting_rate: z.number(),
  }),
  handoff_rules: z.string(),
});

export type AgentSpec = z.infer<typeof SpecSchema>;

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Resposta da IA sem JSON válido.");

  cleaned = cleaned
    .slice(start, end + 1)
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join("");

  return JSON.parse(cleaned);
}

function fallbackAgentSpec(data: AgentBuilderWizard): AgentSpec {
  const niche = data.products.split(/[,.\n]/)[0]?.trim() || data.goal;
  const cadence = data.create_cadence
    ? [
        {
          day: 1,
          channel: "whatsapp" as const,
          message: `Olá! Vi que empresas com perfil de ${data.icp} costumam buscar ganhos com ${data.products}. Faz sentido conversarmos rapidamente?`,
        },
        {
          day: 3,
          channel: "email" as const,
          message: `Retomando meu contato: a ideia é entender se ${data.products} pode ajudar no seu cenário atual. Posso te enviar um resumo objetivo?`,
        },
        {
          day: 5,
          channel: "whatsapp" as const,
          message:
            "Passando só para saber se este tema está no radar agora ou se devo falar em outro momento.",
        },
        {
          day: 10,
          channel: "email" as const,
          message:
            "Último contato por aqui. Se fizer sentido avaliar oportunidades de melhoria, fico à disposição para uma conversa breve.",
        },
      ]
    : [];

  return SpecSchema.parse({
    name: `${data.goal} ${niche}`.slice(0, 48),
    description: `Agente ${data.personality} para ${data.goal.toLowerCase()} focado em ${data.audience.toUpperCase()} via ${data.channel}.`,
    master_prompt: `Você é um agente ${data.personality} de ${data.goal}. Atue em pt-BR, com mensagens claras, curtas e humanas. Qualifique contatos com ICP: ${data.icp}. Apresente os produtos/serviços: ${data.products}. Faça perguntas objetivas, trate objeções com empatia e transfira para humano quando houver intenção real, pedido de reunião, negociação avançada ou dúvida fora do escopo.`,
    initial_greeting: `Olá! Tudo bem? Sou assistente da equipe comercial e queria entender se ${data.products} faz sentido para o seu momento.`,
    rules_can: [
      "Qualificar necessidade, perfil e timing",
      "Explicar benefícios de forma objetiva",
      "Registrar objeções e próximos passos",
      "Sugerir reunião quando houver fit",
    ],
    rules_cannot: [
      "Prometer resultados garantidos",
      "Inventar preços, prazos ou condições",
      "Pressionar o lead",
      "Responder temas jurídicos ou técnicos sem base",
    ],
    qualification_criteria: [
      "Tem aderência ao ICP informado",
      "Demonstra dor ou oportunidade clara",
      "Possui interesse em conversar",
      "Tem capacidade ou influência na decisão",
    ],
    disqualification_criteria: [
      "Fora do ICP",
      "Sem necessidade atual",
      "Sem autorização ou influência",
      "Solicita algo fora do produto/serviço",
    ],
    objections: [
      {
        objection: "Já temos fornecedor",
        response:
          "Entendo. A ideia não é substituir sem contexto, mas comparar se existe algum ponto que poderia melhorar hoje.",
      },
      {
        objection: "Está caro",
        response:
          "Faz sentido avaliar custo. Posso entender o que você compara hoje para ver se existe retorno claro?",
      },
      {
        objection: "Sem tempo agora",
        response:
          "Claro. Posso ser breve: vale retomar em outro momento ou este assunto não é prioridade?",
      },
    ],
    authority_arguments: [
      "Abordagem consultiva baseada no perfil do lead",
      "Foco em dor, timing e próximo passo",
      "Comunicação objetiva e humana",
    ],
    initial_messages: {
      whatsapp: `Olá! Vi que seu perfil pode ter sinergia com ${data.products}. Posso te fazer uma pergunta rápida?`,
      email: {
        subject: `Conversa rápida sobre ${niche}`,
        body: `Olá, tudo bem?\n\nTrabalho com ${data.products} e queria entender se isso faz sentido para empresas com perfil de ${data.icp}.\n\nPodemos conversar rapidamente esta semana?`,
      },
      voice: `Olá, tudo bem? Meu contato é rápido. Queria entender se ${data.products} faz sentido para o cenário de vocês hoje.`,
    },
    cadence,
    kpis: { target_response_rate: 25, target_qualification_rate: 35, target_meeting_rate: 15 },
    handoff_rules:
      data.handoff_rules ||
      "Transferir para humano quando o lead pedir reunião, demonstrar intenção de compra, solicitar proposta, preço detalhado ou tiver dúvida avançada.",
  });
}

/** Generate the agent specification from wizard answers (no DB writes). */
export const generateAgentSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => WizardSchema.parse(d))
  .handler(async ({ data, context }): Promise<AgentSpec> => {
    const { createOpenAiCompatibleProvider, getAiApiKey } = await import("@/lib/ai-gateway");
    const { generateText } = await import("ai");
    const key = getAiApiKey();

    // Optionally pull org knowledge snippets to ground generation
    let knowledgeBlock = "";
    if (data.use_knowledge) {
      const { data: orgRow } = await context.supabase.rpc("current_org_id");
      if (orgRow) {
        const { data: rows } = await context.supabase
          .from("knowledge_sources")
          .select("title, description, category")
          .limit(20);
        if (rows?.length) {
          knowledgeBlock = `\n\nBASE DE CONHECIMENTO DA ORGANIZAÇÃO (use para contextualizar):\n${rows
            .map(
              (r: { title: string; description: string | null; category: string }) =>
                `- [${r.category}] ${r.title}${r.description ? ` — ${r.description}` : ""}`,
            )
            .join("\n")}`;
        }
      }
    }

    try {
      const gateway = createOpenAiCompatibleProvider(key);
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system:
          "Você é especialista em construção de agentes de IA para vendas/atendimento em pt-BR. Gere uma especificação completa, prática e específica ao contexto. Mensagens curtas e humanas. Cadências com pausas naturais. Não use placeholders genéricos. Responda SOMENTE com JSON válido, sem markdown, sem comentários.",
        prompt: `Construa uma especificação completa para o agente.

Objetivo: ${data.goal}
Canal: ${data.channel}
Público: ${data.audience.toUpperCase()}
ICP: ${data.icp}
Produtos/Serviços: ${data.products}
Objeções conhecidas: ${data.objections || "(o agente deve inferir)"}
Personalidade: ${data.personality}
Regras de transferência humana: ${data.handoff_rules || "(definir critérios padrão)"}
Cadência automática: ${data.create_cadence ? "Sim — gere 4 toques (Dia 1, 3, 5, 10)" : "Não — gere apenas o toque inicial e deixe cadence vazio"}
${knowledgeBlock}

Retorne APENAS um objeto JSON com EXATAMENTE estas chaves:
{
  "name": string,
  "description": string,
  "master_prompt": string,
  "initial_greeting": string,
  "rules_can": string[],
  "rules_cannot": string[],
  "qualification_criteria": string[],
  "disqualification_criteria": string[],
  "objections": [{ "objection": string, "response": string }],
  "authority_arguments": string[],
  "initial_messages": { "whatsapp": string, "email": { "subject": string, "body": string }, "voice": string },
  "cadence": [{ "day": number, "channel": "whatsapp"|"email"|"voice", "message": string }],
  "kpis": { "target_response_rate": number, "target_qualification_rate": number, "target_meeting_rate": number },
  "handoff_rules": string
}
Nome curto e específico ao nicho (ex: "SDR Outbound TI").`,
      });
      return SpecSchema.parse(extractJsonFromResponse(text));
    } catch (error) {
      console.error("Agent builder AI response invalid, using fallback spec", error);
      return fallbackAgentSpec(data);
    }
  });

const CreateSchema = z.object({
  wizard: WizardSchema,
  spec: SpecSchema,
});

/** Persist the agent based on the reviewed spec. */
export const createAgentFromSpec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isManager } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isManager) throw new Error("Apenas gerentes/admins podem criar agentes.");

    const { spec, wizard } = data;

    const { data: orgRow } = await context.supabase.rpc("current_org_id");

    const insert = {
      organization_id: orgRow as unknown as string,
      name: spec.name,
      description: spec.description,
      campaign_goal: wizard.goal,
      personality: wizard.personality,
      product: wizard.products,
      objections: spec.objections.map((o) => `• ${o.objection}\n  → ${o.response}`).join("\n\n"),
      base_prompt: spec.master_prompt,
      initial_greeting: spec.initial_greeting,
      role_title: spec.name,
      agent_type: wizard.goal,
      use_case: wizard.audience,
      channel_priority: wizard.channel,
      qualification_questions: spec.qualification_criteria,
      objection_handling: spec.objections,
      authority_arguments: spec.authority_arguments,
      handoff_rules: { description: spec.handoff_rules, rules: wizard.handoff_rules },
      success_criteria: spec.qualification_criteria,
      failure_criteria: spec.disqualification_criteria,
      knowledge_enabled: wizard.use_knowledge,
      voice_enabled: wizard.channel === "voice" || wizard.channel === "multicanal",
      active: true,
      created_by: context.userId,
    };

    const { data: created, error } = await context.supabase
      .from("ai_agents")
      .insert(insert as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { id: (created as { id: string }).id };
  });

/** Stats for the builder dashboard. */
export const getBuilderStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count: total } = await context.supabase
      .from("ai_agents")
      .select("*", { count: "exact", head: true });
    const { count: active } = await context.supabase
      .from("ai_agents")
      .select("*", { count: "exact", head: true })
      .eq("active", true);
    return { total: total ?? 0, active: active ?? 0 };
  });

export const BUILDER_TEMPLATES = [
  {
    slug: "sdr-ti",
    label: "SDR TI",
    goal: "SDR",
    icp: "Empresas com 10+ computadores",
    products: "Gestão de TI, suporte e infraestrutura",
  },
  {
    slug: "sdr-contabilidade",
    label: "SDR Contabilidade",
    goal: "SDR",
    icp: "PMEs com faturamento R$1M+",
    products: "Serviços contábeis e fiscais",
  },
  {
    slug: "sdr-imobiliaria",
    label: "SDR Imobiliária",
    goal: "SDR",
    icp: "Investidores e compradores qualificados",
    products: "Imóveis residenciais e comerciais",
  },
  {
    slug: "sdr-clinica",
    label: "SDR Clínica",
    goal: "Agendamento",
    icp: "Pacientes locais",
    products: "Consultas e procedimentos clínicos",
  },
  {
    slug: "sdr-marketing",
    label: "SDR Marketing",
    goal: "SDR",
    icp: "Empresas que investem em ads",
    products: "Serviços de marketing digital e performance",
  },
  {
    slug: "sdr-juridico",
    label: "SDR Jurídico",
    goal: "Qualificação",
    icp: "Empresas com demandas recorrentes",
    products: "Assessoria jurídica empresarial",
  },
] as const;
