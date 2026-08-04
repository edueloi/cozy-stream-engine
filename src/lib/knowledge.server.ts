import { getAiApiKey, getAiBaseUrl } from "@/lib/ai-gateway";

function getKey() {
  return getAiApiKey();
}

const EMBED_MODEL = "openai/text-embedding-3-small"; // 1536 dims

/** Generate embeddings through an OpenAI-compatible API. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${getAiBaseUrl()}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

/** Split text into ~`size` char chunks with `overlap`. */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + size);
    let cut = end;
    if (end < clean.length) {
      const back = clean.lastIndexOf("\n", end);
      const back2 = clean.lastIndexOf(". ", end);
      cut = Math.max(back, back2);
      if (cut <= i + size * 0.5) cut = end;
    }
    out.push(clean.slice(i, cut).trim());
    if (cut >= clean.length) break;
    i = Math.max(cut - overlap, i + 1);
  }
  return out.filter((c) => c.length > 20);
}

/** Best-effort extraction from a URL (HTML → plain text). */
export async function fetchUrlAsText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 JcsKnowledgeBot" },
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a context block from matched chunks for use as agent grounding. */
export function buildContextBlock(
  matches: Array<{ source_title: string; chunk_text: string; similarity: number }>,
): string {
  if (!matches.length) return "";
  return matches
    .map(
      (m, i) =>
        `[${i + 1}] (${m.source_title} • similaridade ${(m.similarity * 100).toFixed(0)}%)\n${m.chunk_text}`,
    )
    .join("\n\n");
}
