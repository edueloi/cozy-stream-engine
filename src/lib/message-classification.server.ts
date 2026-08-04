// Deterministic (no LLM) classifiers used by the WhatsApp inbound flow to
// decide whether a message came from a human or from an automated system,
// and whether the lead explicitly wants to schedule a meeting.
//
// Everything here is intentionally regex-based so it runs before any AI
// call and cannot itself get stuck in a bot loop.

export type MessageOrigin =
  | "human_message"
  | "automatic_reply"
  | "chatbot_message"
  | "menu_message"
  | "out_of_office"
  | "system_message"
  | "unknown";

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Phrases that overwhelmingly indicate an automated WhatsApp reply / IVR.
const AUTO_REPLY_PATTERNS: RegExp[] = [
  /\brecebemos sua mensagem\b/,
  /\bobrigad[oa] pelo (seu )?contato\b/,
  /\bagradec[eo] (o|pelo) contato\b/,
  /\bem breve (um )?(atendente|consultor|responsavel)/,
  /\bassim que possivel\b.*respond/,
  /\baguarde,? (voce sera|voce ira ser) atendid[oa]/,
  /\besta e uma mensagem automatica\b/,
  /\bmensagem automatica\b/,
  /\bresposta automatica\b/,
  /\bnao responda a esta mensagem\b/,
  /\bfavor nao responder\b/,
  /\bbem[- ]vind[oa] ao (nosso )?(atendimento|whatsapp)\b/,
  /\bassistente virtual\b/,
  /\bseu protocolo (e|:)\s*\S+/,
  /\bprotocolo de atendimento\b/,
  /\bnosso horario de (atendimento|funcionamento)\b/,
  /\bhorario de atendimento\b/,
];

const OUT_OF_OFFICE_PATTERNS: RegExp[] = [
  /\bestamos ausentes\b/,
  /\bfora do (nosso )?horario\b/,
  /\bfora do expediente\b/,
  /\bno momento (nao|estamos)\b/,
  /\bretornaremos (o )?contato\b/,
  /\bretornamos assim que possivel\b/,
];

// Numbered menus / IVR options.
const MENU_PATTERNS: RegExp[] = [
  /\bdigite\s+\d\b/,
  /\bpressione\s+\d\b/,
  /\bescolha uma (das )?op[cç]?[oõ]es\b/,
  /\bselecione uma (das )?op[cç]?[oõ]es\b/,
  /\bpara continuar,? (informe|digite)\b/,
  /\bpara (falar com|acessar) .+ digite\b/,
];

// Generic chatbot greetings / self-identification.
const CHATBOT_PATTERNS: RegExp[] = [
  /\bsou (o|a) (assistente|bot|chatbot) virtual\b/,
  /\batendimento automatizado\b/,
  /\batendimento automatico\b/,
  /\bcentral de atendimento\b.*\bautomat/,
];

function looksLikeNumberedMenu(text: string): boolean {
  // At least two lines that start with "1", "2" (or "1)", "1 -", "1.")
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let count = 0;
  for (const l of lines) {
    if (/^\d{1,2}\s*[).\-–:]/.test(l)) count++;
  }
  return count >= 2;
}

export function classifyMessageOrigin(text: string): MessageOrigin {
  const raw = (text || "").trim();
  if (!raw) return "unknown";
  const n = normalize(raw);

  if (OUT_OF_OFFICE_PATTERNS.some((r) => r.test(n))) return "out_of_office";
  if (MENU_PATTERNS.some((r) => r.test(n)) || looksLikeNumberedMenu(raw)) return "menu_message";
  if (CHATBOT_PATTERNS.some((r) => r.test(n))) return "chatbot_message";
  if (AUTO_REPLY_PATTERNS.some((r) => r.test(n))) return "automatic_reply";

  return "human_message";
}

export function isAutomaticOrigin(kind: MessageOrigin): boolean {
  return (
    kind === "automatic_reply" ||
    kind === "chatbot_message" ||
    kind === "menu_message" ||
    kind === "out_of_office" ||
    kind === "system_message"
  );
}

// -------- Bot-loop protection --------

export interface RecentInbound {
  body: string | null;
  created_at: string;
}

/**
 * Look at the last few inbound messages and decide whether the peer looks like
 * another bot. Triggers when we see repeated automatic messages, near-duplicate
 * bodies, or a burst of very fast responses.
 */
export function detectBotLoop(recent: RecentInbound[]): {
  suspected: boolean;
  reason?: string;
  autoCount: number;
} {
  const items = recent.filter((m) => (m.body ?? "").trim().length > 0).slice(0, 6);
  if (items.length < 2) return { suspected: false, autoCount: 0 };

  const kinds = items.map((m) => classifyMessageOrigin(m.body ?? ""));
  const autoCount = kinds.filter((k) => isAutomaticOrigin(k)).length;

  if (autoCount >= 3) {
    return { suspected: true, reason: "repeated_automatic_messages", autoCount };
  }

  // Same body received twice in a row (within the window).
  const first = normalize(items[0].body ?? "");
  const second = normalize(items[1]?.body ?? "");
  if (first && first === second) {
    return { suspected: true, reason: "duplicate_inbound", autoCount };
  }

  // Burst of very fast replies (< 4s apart) — likely automated.
  let fastPairs = 0;
  for (let i = 0; i < items.length - 1; i++) {
    const a = new Date(items[i].created_at).getTime();
    const b = new Date(items[i + 1].created_at).getTime();
    if (Math.abs(a - b) < 4000) fastPairs++;
  }
  if (fastPairs >= 2) {
    return { suspected: true, reason: "burst_rapid_replies", autoCount };
  }

  return { suspected: false, autoCount };
}

// -------- Explicit meeting intent --------

const MEETING_INTENT_PATTERNS: RegExp[] = [
  /\bquero (agendar|marcar|conversar)\b/,
  /\b(vamos|podemos|poderia|poderiamos) (agendar|marcar|conversar)\b/,
  /\bagendar (uma )?(reuniao|conversa|call|demo|apresentacao)\b/,
  /\bmarcar (uma )?(reuniao|conversa|call|demo|apresentacao)\b/,
  /\btenho interesse em (conversar|agendar|marcar)\b/,
  /\bquero falar com (o )?(especialista|consultor|vendedor)\b/,
  /\bpode (me )?(ligar|chamar)\b/,
  /\bmanda(r)? (o )?(link|convite) (de |do )?(agendamento|reuniao)\b/,
  /\bqual (o )?(seu |teu )?(horario|disponibilidade)\b/,
  /\bque (dias|horarios) (voce|voces) (tem|teria)\b/,
  /\bpode ser (amanha|hoje|segunda|terca|quarta|quinta|sexta)\b/,
  /\bpode ser (as )?\d{1,2}\s*[h:]/,
];

export function hasExplicitMeetingIntent(text: string): boolean {
  const n = normalize(text);
  return MEETING_INTENT_PATTERNS.some((r) => r.test(n));
}

// -------- Disinterest kind (temporary vs definitive) --------
//
// "Agora não" is NOT a discard signal. Only explicit definitive refusals
// should be treated as `recusa_definitiva`, and even then the AI must only
// hand off to a human — never mark the lead as discarded on its own.

export type DisinterestKind = "sem_momento" | "recusa_definitiva" | "neither";

const TEMPORARY_PATTERNS: RegExp[] = [
  /\bagora nao\b/,
  /\bnao (e|eh) prioridade\b/,
  /\bnao (e|eh) o momento\b/,
  /\bmomento nao (e|eh)\b/,
  /\bnao tenho interesse no momento\b/,
  /\bsem interesse no momento\b/,
  /\bnao temos (necessidade|interesse) (ainda|agora)\b/,
  /\btalvez\b.{0,30}\b(futuro|frente|semestre|ano|mes|trimestre)\b/,
  /\bquem sabe (mais )?(no )?(futuro|frente)\b/,
  /\bestamos (estruturando|montando|abrindo|comecando|comecando agora)\b/,
  /\bem (fase de )?estrutura(cao|r)\b/,
  /\bestamos (avaliando|analisando|estudando)\b/,
  /\b(sem|nao (tem|temos)) orcamento (no momento|agora)\b/,
  /\bmais (para )?(frente|adiante)\b/,
  /\bretorna(r)? (em|daqui|apos)\b/,
  /\bme (procure|procura|chama|chame) (em|daqui|no)\b/,
  /\bpor enquanto (nao|ainda nao)\b/,
  /\bainda nao (temos|estamos|precisamos)\b/,
];

const DEFINITIVE_PATTERNS: RegExp[] = [
  /\bnao queremos (esse|este) (servico|produto|contrato)\b/,
  /\bja decidimos nao (contratar|adquirir|seguir|comprar)\b/,
  /\bnao (ha|existe|havera) interesse (futuro|nenhum)\b/,
  /\bnunca (teremos|vamos ter) interesse\b/,
  /\bde jeito nenhum\b/,
  /\bjamais\b/,
];

export function classifyDisinterestKind(text: string): DisinterestKind {
  const n = normalize(text);
  if (!n) return "neither";
  if (DEFINITIVE_PATTERNS.some((r) => r.test(n))) return "recusa_definitiva";
  if (TEMPORARY_PATTERNS.some((r) => r.test(n))) return "sem_momento";
  return "neither";
}

// -------- Outbound repetition guard --------

function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function jaccard(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** True when the proposed outbound is too similar to something we already sent. */
export function isRepetitiveOutbound(candidate: string, recentOutbound: string[]): boolean {
  const c = normalize(candidate);
  if (!c) return true;
  for (const prev of recentOutbound) {
    const p = normalize(prev);
    if (!p) continue;
    if (p === c) return true;
    if (jaccard(candidate, prev) >= 0.85) return true;
  }
  return false;
}