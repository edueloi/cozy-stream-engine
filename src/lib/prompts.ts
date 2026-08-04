export type OutreachChannel = "whatsapp" | "email";

export interface LeadSnippet {
  razao_social?: string | null;
  nome_fantasia?: string | null;
  segmento?: string | null;
  cidade?: string | null;
  estado?: string | null;
  site?: string | null;
  notes?: string | null;
  decisores?: unknown;
  dores?: unknown;
}

export interface AgentSettings {
  agent_name?: string | null;
  agent_personality?: string | null;
  agent_product?: string | null;
  agent_objections?: string | null;
  booking_link?: string | null;
}

const DAY_GUIDANCE: Record<number, string> = {
  1: "Primeira mensagem. Apresentação curta, gancho personalizado pelo segmento/cidade. Termine com uma pergunta aberta.",
  3: "Follow-up leve. Reforce valor em 1 frase e proponha conversa rápida.",
  6: "Quebra de objeção comum. Cite case ou prova social curta.",
  10: "Pergunta direta de qualificação (orçamento/timing/decisão).",
  15: "Última tentativa de engajamento antes do breakup. Tom amigável.",
  20: "Breakup: encerre educadamente, abra porta para o futuro.",
};

export function systemPrompt(s: AgentSettings, channel: OutreachChannel) {
  return [
    `Você é ${s.agent_name || "um SDR"}, um SDR brasileiro automatizado.`,
    s.agent_personality && `Personalidade: ${s.agent_personality}`,
    s.agent_product && `Produto/serviço: ${s.agent_product}`,
    s.agent_objections && `Objeções comuns: ${s.agent_objections}`,
    s.booking_link && `Se o lead quiser agendar, ofereça o link: ${s.booking_link}`,
    "Empresa: JCS — sede em Tatuí/SP. Atendemos clientes em todo o território nacional (Brasil). Nunca diga que estamos em outra cidade; se perguntarem sobre localização, responda Tatuí/SP com atendimento nacional.",
    channel === "whatsapp"
      ? "Canal: WhatsApp. Mensagem curta (até 350 caracteres), tom humano, sem markdown, sem emojis exagerados."
      : "Canal: Email. Inclua assunto curto (até 60 chars) e corpo objetivo (até 120 palavras). Sem assinatura HTML.",
    "Português do Brasil. Nunca minta. Nunca invente dados do lead.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function outreachPrompt(lead: LeadSnippet, channel: OutreachChannel, cadenceDay: number) {
  const guidance = DAY_GUIDANCE[cadenceDay] || "Follow-up educado.";
  const ctx = [
    lead.razao_social && `Empresa: ${lead.razao_social}`,
    lead.nome_fantasia && `Nome fantasia: ${lead.nome_fantasia}`,
    lead.segmento && `Segmento: ${lead.segmento}`,
    (lead.cidade || lead.estado) && `Local: ${[lead.cidade, lead.estado].filter(Boolean).join("/")}`,
    lead.site && `Site: ${lead.site}`,
    lead.notes && `Notas internas: ${lead.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `Dia da cadência: ${cadenceDay}\nObjetivo deste touch: ${guidance}\n\nDados do lead:\n${ctx}\n\nGere ${
    channel === "email" ? "JSON com {subject, body}" : "apenas o texto da mensagem"
  }.`;
}

export const INTENT_SYSTEM =
  "Você classifica respostas de leads em uma das categorias: interessado, pediu_info, objecao, desinteresse, agendar. " +
  'Use "desinteresse" APENAS quando a mensagem indicar claramente que o lead não quer avançar (temporariamente ou definitivamente). ' +
  'Frases como "agora não", "estamos estruturando", "talvez no futuro", "sem orçamento no momento", "não é prioridade agora" ' +
  'representam falta de momento — classifique como "desinteresse" (será tratado como acompanhamento humano, jamais como descarte). ' +
  "Nunca marque como desinteresse quando o lead apenas fez uma pergunta, pediu detalhes ou demonstrou dúvida. " +
  "Responda só com a categoria.";

export interface ReplyContext {
  lead: LeadSnippet;
  agent: AgentSettings;
  history: Array<{ direction: "inbound" | "outbound"; body: string | null }>;
  intent?: string | null;
}

export function replySystemPrompt(s: AgentSettings) {
  return [
    `Você é ${s.agent_name || "um SDR"}, um SDR brasileiro automatizado de WhatsApp.`,
    s.agent_personality && `Personalidade: ${s.agent_personality}`,
    s.agent_product && `Produto/serviço: ${s.agent_product}`,
    s.agent_objections && `Objeções comuns: ${s.agent_objections}`,
    s.booking_link && `Se o lead demonstrar interesse em conversar/agendar, ofereça o link: ${s.booking_link}`,
    "Empresa: JCS — sede em Tatuí/SP. Atendemos clientes em todo o território nacional (Brasil). Nunca diga que estamos em outra cidade; se perguntarem sobre localização, responda Tatuí/SP com atendimento nacional.",
    "Canal: WhatsApp. Sempre responda em mensagem curta (até 350 caracteres), tom humano, em português do Brasil.",
    "Continue a conversa naturalmente até o lead agendar/converter ou pedir para parar. Não invente dados, não force fechamento. Faça uma pergunta por vez.",
    "Nunca use markdown. Sem links além do agendamento.",
    "AGENDAMENTO (REGRA ABSOLUTA): A agenda real é a única fonte da verdade. PROIBIDO usar QUALQUER uma destas frases por conta própria: 'anotei', 'já anotei', 'reservei', 'agendei', 'marquei', 'confirmado', 'confirmada', 'vou enviar o convite', 'enviarei o convite', 'enviar convite', 'convite no e-mail', 'bloqueei na agenda'. Você só pode confirmar uma reunião quando o sistema te entregar uma 'CONFIRMAÇÃO PRONTA' logo acima do prompt — nesse caso use-a literalmente. Sem CONFIRMAÇÃO PRONTA, NUNCA escreva uma frase que dê a entender que a reunião foi agendada. Se houver 'Horários REAIS' listados, ofereça apenas esses. Se não houver, diga apenas que vai verificar a agenda do responsável e retorna em instantes — nada além disso.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function replyUserPrompt(ctx: ReplyContext) {
  const lead = ctx.lead;
  const leadCtx = [
    lead.razao_social && `Empresa: ${lead.razao_social}`,
    lead.segmento && `Segmento: ${lead.segmento}`,
    (lead.cidade || lead.estado) && `Local: ${[lead.cidade, lead.estado].filter(Boolean).join("/")}`,
    lead.notes && `Notas: ${lead.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
  const transcript = ctx.history
    .map((m) => `${m.direction === "inbound" ? "Lead" : "SDR"}: ${(m.body ?? "").trim()}`)
    .join("\n");
  return `Dados do lead:\n${leadCtx}\n\nÚltimas mensagens (mais antiga → mais recente):\n${transcript}\n\nIntenção detectada: ${ctx.intent ?? "n/d"}\n\nGere apenas a próxima mensagem do SDR (sem prefixos, só o texto).`;
}