import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const KNOWLEDGE_CATEGORIES = [
  "empresa",
  "produtos",
  "servicos",
  "objecoes",
  "faq",
  "cases",
  "processos",
  "comercial",
  "suporte",
  "juridico",
  "financeiro",
  "personalizado",
] as const;

export const SOURCE_TYPES = [
  "text",
  "markdown",
  "faq",
  "url",
  "pdf",
  "docx",
  "txt",
  "csv",
  "pptx",
  "xlsx",
  "youtube",
  "youtube_channel",
  "audio",
  "transcription",
] as const;

/** List sources for current org. */
export const listKnowledgeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("knowledge_sources")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

/** Stats for the admin panel. */
export const getKnowledgeStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ count: docs }, { count: chunks }, { data: lastIndexed }, { data: sizeRow }] =
      await Promise.all([
        context.supabase
          .from("knowledge_sources")
          .select("*", { count: "exact", head: true }),
        context.supabase
          .from("knowledge_chunks")
          .select("*", { count: "exact", head: true }),
        context.supabase
          .from("knowledge_sources")
          .select("updated_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        context.supabase
          .from("knowledge_sources")
          .select("file_size_bytes")
          .not("file_size_bytes", "is", null),
      ]);
    const totalBytes = (sizeRow ?? []).reduce(
      (acc: number, r: { file_size_bytes: number | null }) => acc + (r.file_size_bytes ?? 0),
      0,
    );
    return {
      documents: docs ?? 0,
      chunks: chunks ?? 0,
      lastIndexed: lastIndexed?.updated_at ?? null,
      totalBytes,
    };
  });

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  source_type: z.enum(SOURCE_TYPES),
  source_url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(), // pasted text/markdown/faq
});

/** Create a source and ingest immediately (text/url/markdown/faq/transcription). */
export const createKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: orgRow } = await context.supabase.rpc("current_org_id");
    const orgId = orgRow as unknown as string;

    const { data: source, error: insErr } = await context.supabase
      .from("knowledge_sources")
      .insert({
        organization_id: orgId,
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        source_type: data.source_type,
        source_url: data.source_url ?? null,
        status: "processing",
        created_by: context.userId,
      })
      .select()
      .single();
    if (insErr) throw insErr;

    try {
      const { fetchUrlAsText, chunkText, embedTexts } = await import("@/lib/knowledge.server");
      let raw = "";
      if (data.source_type === "url" && data.source_url) {
        raw = await fetchUrlAsText(data.source_url);
      } else if (data.content) {
        raw = data.content;
      } else {
        throw new Error("Conteúdo vazio");
      }

      const chunks = chunkText(raw);
      if (chunks.length === 0) throw new Error("Sem conteúdo após processamento");

      // Batch embeddings (50 per call)
      const embeddings: number[][] = [];
      for (let i = 0; i < chunks.length; i += 50) {
        const batch = chunks.slice(i, i + 50);
        const vectors = await embedTexts(batch);
        embeddings.push(...vectors);
      }

      const rows = chunks.map((text, i) => ({
        organization_id: orgId,
        source_id: source.id,
        chunk_index: i,
        chunk_text: text,
        embedding: embeddings[i] as unknown as string, // pgvector accepts array
        token_count: Math.ceil(text.length / 4),
      }));

      // Insert in pages of 100
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await context.supabase
          .from("knowledge_chunks")
          .insert(rows.slice(i, i + 100) as never);
        if (error) throw error;
      }

      await context.supabase
        .from("knowledge_sources")
        .update({
          status: "ready",
          chunk_count: chunks.length,
          file_size_bytes: raw.length,
          error: null,
        })
        .eq("id", source.id);

      return { id: source.id, chunks: chunks.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Falha no processamento";
      await context.supabase
        .from("knowledge_sources")
        .update({ status: "failed", error: msg })
        .eq("id", source.id);
      throw new Error(msg);
    }
  });

export const deleteKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("knowledge_sources")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const SearchSchema = z.object({
  query: z.string().min(1).max(2000),
  match_count: z.number().int().min(1).max(20).default(5),
  threshold: z.number().min(0).max(1).default(0.3),
  categories: z.array(z.enum(KNOWLEDGE_CATEGORIES)).optional(),
});

/** Semantic search over the org's knowledge base. */
export const searchKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => SearchSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: orgRow } = await context.supabase.rpc("current_org_id");
    const orgId = orgRow as unknown as string;
    const { embedTexts } = await import("@/lib/knowledge.server");
    const [vec] = await embedTexts([data.query]);
    const { data: rows, error } = await context.supabase.rpc(
      "match_knowledge_chunks" as never,
      {
        _org: orgId,
        _query_embedding: vec as unknown as string,
        _match_count: data.match_count,
        _threshold: data.threshold,
        _categories: data.categories ?? null,
      } as never,
    );
    if (error) throw error;
    return (rows ?? []) as Array<{
      chunk_id: string;
      source_id: string;
      source_title: string;
      source_category: string;
      chunk_text: string;
      similarity: number;
    }>;
  });

/** Conversar com a base: RAG QA using only retrieved context. */
export const askKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        question: z.string().min(1).max(2000),
        match_count: z.number().int().min(1).max(15).default(6),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: orgRow } = await context.supabase.rpc("current_org_id");
    const orgId = orgRow as unknown as string;
    const { embedTexts, buildContextBlock } = await import("@/lib/knowledge.server");
    const [vec] = await embedTexts([data.question]);
    const { data: rows, error } = await context.supabase.rpc(
      "match_knowledge_chunks" as never,
      {
        _org: orgId,
        _query_embedding: vec as unknown as string,
        _match_count: data.match_count,
        _threshold: 0.25,
        _categories: null,
      } as never,
    );
    if (error) throw error;
    const matches = (rows ?? []) as Array<{
      source_id: string;
      source_title: string;
      source_category: string;
      chunk_text: string;
      similarity: number;
    }>;
    if (!matches.length) {
      return {
        answer:
          "Não encontrei informações relevantes na base de conhecimento para responder essa pergunta.",
        sources: [],
      };
    }

    const context_block = buildContextBlock(matches);
    const { createOpenAiCompatibleProvider, getAiApiKey } = await import("@/lib/ai-gateway");
    const { generateText } = await import("ai");
    const key = getAiApiKey();
    const gateway = createOpenAiCompatibleProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "Você responde estritamente com base no CONTEXTO fornecido. Se a resposta não estiver no contexto, diga claramente que não há informação suficiente. Cite as fontes usando os números entre colchetes [1], [2] etc.",
      prompt: `CONTEXTO:\n${context_block}\n\nPERGUNTA: ${data.question}\n\nResponda em pt-BR.`,
    });

    return {
      answer: text,
      sources: matches.map((m, i) => ({
        index: i + 1,
        source_id: m.source_id,
        title: m.source_title,
        category: m.source_category,
        excerpt: m.chunk_text.slice(0, 280),
        similarity: m.similarity,
      })),
    };
  });
