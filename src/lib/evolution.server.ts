interface EvolutionConfig {
  instanceUrl: string;
  instanceName: string;
  apiKey: string;
}

type UnknownRecord = Record<string, unknown>;

export interface EvolutionMessage {
  id: string;
  text: string;
  fromMe: boolean;
  timestamp: number;
  remoteJid: string | null;
  raw: unknown;
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (!digits) throw new Error("Telefone vazio");
  // Remove leading international-access zeros e.g. "0055..."
  digits = digits.replace(/^0+/, "");
  // BR local numbers: 10 (landline / DDD+8) or 11 (mobile / DDD+9+8) → prefix 55
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function readString(value: unknown, path: string[]): string | null {
  const raw = readPath(value, path);
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function readObjectPath(value: unknown, path: string[]): UnknownRecord | null {
  const raw = readPath(value, path);
  return isRecord(raw) ? raw : null;
}

function readBoolean(value: unknown, path: string[]): boolean | null {
  const raw = readPath(value, path);
  return typeof raw === "boolean" ? raw : null;
}

function readTimestamp(value: unknown): number {
  const raw =
    readPath(value, ["messageTimestamp"]) ??
    readPath(value, ["timestamp"]) ??
    readPath(value, ["createdAt"]) ??
    readPath(value, ["created_at"]) ??
    0;
  const n = isRecord(raw) ? Number(raw.low ?? raw.seconds ?? raw.value ?? 0) : Number(raw);
  if (Number.isFinite(n) && n > 0) return n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000);
}

function unwrapMessage(message: unknown): unknown {
  return (
    readPath(message, ["ephemeralMessage", "message"]) ??
    readPath(message, ["viewOnceMessage", "message"]) ??
    readPath(message, ["viewOnceMessageV2", "message"]) ??
    readPath(message, ["documentWithCaptionMessage", "message"]) ??
    readPath(message, ["editedMessage", "message"]) ??
    message ??
    {}
  );
}

function extractText(record: unknown): string | null {
  const msg = unwrapMessage(readPath(record, ["message"]) ?? record);
  const text =
    readString(msg, ["conversation"]) ??
    readString(msg, ["extendedTextMessage", "text"]) ??
    readString(msg, ["imageMessage", "caption"]) ??
    readString(msg, ["videoMessage", "caption"]) ??
    readString(msg, ["documentMessage", "caption"]) ??
    readString(msg, ["buttonsResponseMessage", "selectedDisplayText"]) ??
    readString(msg, ["listResponseMessage", "title"]) ??
    readString(msg, ["templateButtonReplyMessage", "selectedDisplayText"]) ??
    readString(msg, ["interactiveResponseMessage", "body", "text"]) ??
    readString(msg, ["pollCreationMessage", "name"]) ??
    readString(record, ["text", "message"]) ??
    readString(record, ["text"]) ??
    readString(record, ["body"]) ??
    readString(record, ["messageText"]);
  if (text) return text;
  if (readPath(msg, ["audioMessage"])) return "[áudio]";
  if (readPath(msg, ["imageMessage"])) return "[imagem]";
  if (readPath(msg, ["videoMessage"])) return "[vídeo]";
  if (readPath(msg, ["documentMessage"])) return "[documento]";
  return null;
}

function extractRemoteJid(record: unknown): string | null {
  return (
    readString(record, ["key", "remoteJid"]) ??
    readString(record, ["message", "key", "remoteJid"]) ??
    readString(record, ["remoteJid"]) ??
    readString(record, ["chatId"]) ??
    readString(record, ["jid"]) ??
    readString(record, ["from"])
  );
}

function looksLikeMessageRecord(record: unknown): boolean {
  return (
    isRecord(record) &&
    (!!record.key ||
      !!record.message ||
      !!record.id ||
      !!record.remoteJid ||
      !!record.body ||
      !!record.text)
  );
}

function findMessageArrays(value: unknown, depth = 0): unknown[][] {
  if (!value || depth > 5) return [];
  if (Array.isArray(value)) return value.some(looksLikeMessageRecord) ? [value] : [];
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap((v) => findMessageArrays(v, depth + 1));
}

function parseMessages(json: unknown): EvolutionMessage[] {
  const arrays = findMessageArrays(json);
  const records = arrays.sort((a, b) => b.length - a.length)[0] ?? [];
  const out: EvolutionMessage[] = [];
  for (const r of records) {
    const key = readObjectPath(r, ["key"]) ?? readObjectPath(r, ["message", "key"]);
    const text = extractText(r);
    if (!text) continue;
    const timestamp = readTimestamp(r);
    const remoteJid = extractRemoteJid(r);
    const id = String(
      readString(key, ["id"]) ??
        readString(r, ["id"]) ??
        readString(r, ["messageId"]) ??
        readString(r, ["message_id"]) ??
        `sync:${remoteJid ?? "unknown"}:${timestamp}:${stableHash(text)}`,
    );
    out.push({
      id,
      text,
      fromMe: readBoolean(key, ["fromMe"]) ?? readBoolean(r, ["fromMe"]) ?? false,
      timestamp,
      remoteJid,
      raw: r,
    });
  }
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

async function postFindMessages(
  cfg: EvolutionConfig,
  bodies: unknown[],
): Promise<EvolutionMessage[]> {
  const base = cfg.instanceUrl.replace(/\/$/, "");
  const urls = [
    `${base}/chat/findMessages/${encodeURIComponent(cfg.instanceName)}`,
    `${base}/message/findMessages/${encodeURIComponent(cfg.instanceName)}`,
  ];
  let sawOk = false;
  let lastErr = "";
  for (const url of urls) {
    for (const body of bodies) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = `${res.status}: ${text.slice(0, 200)}`;
        continue;
      }
      sawOk = true;
      let json: unknown = [];
      try {
        json = JSON.parse(text);
      } catch {
        json = [];
      }
      const messages = parseMessages(json);
      if (messages.length > 0) return messages;
    }
  }
  if (sawOk) return [];
  throw new Error(`Evolution findMessages ${lastErr || "sem resposta"}`);
}

function sameChat(remoteJid: string | null, number: string): boolean {
  if (!remoteJid || remoteJid.includes("@g.us")) return false;
  const remoteDigits = remoteJid.replace(/\D/g, "");
  const target = number.replace(/\D/g, "");
  const variants = new Set([remoteDigits, target]);
  for (const d of [remoteDigits, target]) {
    variants.add(d.slice(-8));
    variants.add(d.slice(-9));
    variants.add(d.slice(-10));
    variants.add(d.slice(-11));
    if (d.startsWith("55") && d.length >= 12) {
      const ddd = d.slice(2, 4);
      const rest = d.slice(4);
      variants.add(`55${ddd}${rest.startsWith("9") ? rest.slice(1) : `9${rest}`}`);
    }
  }
  return [...variants].some((v) => v.length >= 8 && remoteDigits.endsWith(v) && target.endsWith(v));
}

export async function sendWhatsAppText(cfg: EvolutionConfig, to: string, body: string) {
  const digits = normalizePhone(to);
  // Evolution expects only digits in the `number` field. Sending a full JID
  // (e.g. 551532269100@s.whatsapp.net) makes its own onWhatsApp check return
  // `exists: false` for fixed-line numbers.
  const number = digits;
  const url = `${cfg.instanceUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(cfg.instanceName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.apiKey },
    body: JSON.stringify({ number, text: body }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`Evolution API ${res.status}: ${text.slice(0, 300)}`);
  const externalId =
    (json as { key?: { id?: string }; messageId?: string })?.key?.id ??
    (json as { messageId?: string })?.messageId ??
    null;
  return { externalId, raw: json };
}

export { normalizePhone };
export type { EvolutionConfig };

export async function fetchRecentMessages(
  cfg: EvolutionConfig,
  limit = 200,
): Promise<EvolutionMessage[]> {
  return postFindMessages(cfg, [
    { where: {}, limit },
    { where: { key: { fromMe: false } }, limit },
    { limit },
    { page: 1, limit },
    { page: 1, offset: limit },
    {},
  ]);
}

export async function fetchChatMessages(
  cfg: EvolutionConfig,
  to: string,
  limit = 50,
): Promise<EvolutionMessage[]> {
  const number = normalizePhone(to);
  const remoteJid = `${number}@s.whatsapp.net`;
  const messages = await postFindMessages(cfg, [
    { where: { key: { remoteJid } }, limit },
    { where: { key: { remoteJid } }, page: 1, limit },
    { where: { key: { remoteJid } }, page: 1, offset: limit },
    { where: { remoteJid }, page: 1, limit },
    { where: { remoteJid }, limit },
    { remoteJid, limit },
    { number, limit },
    { where: {}, limit: Math.max(200, limit) },
  ]);
  if (messages.length > 0) {
    return messages.filter((m) => !m.remoteJid || sameChat(m.remoteJid, number));
  }
  const recent = await fetchRecentMessages(cfg, Math.max(200, limit));
  return recent.filter((m) => sameChat(m.remoteJid, number));
}
