import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, RefreshCw, Search, Sparkles, FileText, Link as LinkIcon, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  KNOWLEDGE_CATEGORIES,
  SOURCE_TYPES,
  listKnowledgeSources,
  getKnowledgeStats,
  createKnowledgeSource,
  deleteKnowledgeSource,
  askKnowledge,
} from "@/lib/knowledge.functions";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Central de Conhecimento — JCS SDR" }] }),
  component: KnowledgePage,
});

type Source = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  source_type: string;
  source_url: string | null;
  status: string;
  error: string | null;
  chunk_count: number;
  file_size_bytes: number | null;
  created_at: string;
};

type Stats = {
  documents: number;
  chunks: number;
  lastIndexed: string | null;
  totalBytes: number;
};

function KnowledgePage() {
  const fetchSources = useServerFn(listKnowledgeSources);
  const fetchStats = useServerFn(getKnowledgeStats);
  const createFn = useServerFn(createKnowledgeSource);
  const deleteFn = useServerFn(deleteKnowledgeSource);
  const askFn = useServerFn(askKnowledge);

  const [sources, setSources] = useState<Source[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof KNOWLEDGE_CATEGORIES)[number]>("personalizado");
  const [sourceType, setSourceType] =
    useState<(typeof SOURCE_TYPES)[number]>("text");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");
  const [creating, setCreating] = useState(false);
  const [parsingFile, setParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ask
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{
    answer: string;
    sources: Array<{
      index: number;
      title: string;
      category: string;
      excerpt: string;
      similarity: number;
    }>;
  } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([fetchSources(), fetchStats()]);
      setSources(s as Source[]);
      setStats(st as Stats);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate() {
    if (!title.trim()) {
      toast.error("Informe um título");
      return;
    }
    if (sourceType === "url" && !sourceUrl.trim()) {
      toast.error("Informe a URL");
      return;
    }
    if (sourceType !== "url" && !content.trim()) {
      toast.error("Cole o conteúdo de texto para indexar");
      return;
    }
    setCreating(true);
    try {
      await createFn({
        data: {
          title,
          description: description || null,
          category,
          source_type: sourceType,
          source_url: sourceType === "url" ? sourceUrl : null,
          content: sourceType === "url" ? null : content,
        },
      });
      toast.success("Conhecimento indexado");
      setTitle("");
      setDescription("");
      setSourceUrl("");
      setContent("");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao indexar");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir esta fonte e todos os seus chunks?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Fonte excluída");
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  }

  async function onAsk() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await askFn({ data: { question, match_count: 6 } });
      setAnswer(res as typeof answer);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na busca");
    } finally {
      setAsking(false);
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingFile(true);
    try {
      const name = file.name.toLowerCase();
      let text = "";
      let detectedType: (typeof SOURCE_TYPES)[number] = "text";

      if (name.endsWith(".pdf")) {
        detectedType = "pdf";
        const pdfjs = await import("pdfjs-dist");
        const workerSrc = (
          (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")) as { default: string }
        ).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
        const buf = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const parts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          parts.push(
            tc.items
              .map((it) => ("str" in it ? it.str : ""))
              .join(" "),
          );
        }
        text = parts.join("\n\n");
      } else if (name.endsWith(".docx")) {
        detectedType = "docx";
        const mammoth = await import("mammoth");
        const buf = await file.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buf });
        text = res.value;
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
        detectedType = name.endsWith(".csv") ? "csv" : "xlsx";
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const parts: string[] = [];
        for (const sheetName of wb.SheetNames) {
          parts.push(`# ${sheetName}`);
          parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]));
        }
        text = parts.join("\n\n");
      } else if (name.endsWith(".txt") || name.endsWith(".md")) {
        detectedType = name.endsWith(".md") ? "markdown" : "txt";
        text = await file.text();
      } else {
        toast.error("Formato não suportado. Use PDF, DOCX, XLSX, CSV, TXT ou MD.");
        return;
      }

      if (!text.trim()) {
        toast.error("Não foi possível extrair texto do arquivo.");
        return;
      }

      setSourceType(detectedType);
      setContent(text);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast.success(`Arquivo "${file.name}" carregado (${text.length.toLocaleString()} caracteres).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler arquivo");
    } finally {
      setParsingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const fileTypeHint =
    sourceType === "url"
      ? "Vamos buscar a URL e extrair o texto."
      : "Cole o conteúdo do documento (texto, markdown, transcrição, FAQs).";

  return (
    <div>
      <PageHeader
        title="Central de Conhecimento"
        description="Treine seus agentes com documentos da sua organização."
        action={
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Documentos" value={stats?.documents ?? 0} />
          <StatCard label="Chunks indexados" value={stats?.chunks ?? 0} />
          <StatCard
            label="Tamanho da base"
            value={`${(((stats?.totalBytes ?? 0) / 1024) | 0).toLocaleString()} KB`}
          />
          <StatCard
            label="Última indexação"
            value={
              stats?.lastIndexed
                ? new Date(stats.lastIndexed).toLocaleString()
                : "—"
            }
          />
        </div>

        <Tabs defaultValue="sources">
          <TabsList>
            <TabsTrigger value="sources">
              <FileText className="mr-2 h-4 w-4" /> Fontes
            </TabsTrigger>
            <TabsTrigger value="add">
              <Sparkles className="mr-2 h-4 w-4" /> Adicionar
            </TabsTrigger>
            <TabsTrigger value="ask">
              <Search className="mr-2 h-4 w-4" /> Conversar com a base
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sources" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Fontes indexadas</CardTitle>
              </CardHeader>
              <CardContent>
                {sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma fonte ainda. Adicione conteúdo na aba "Adicionar".
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sources.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-start justify-between gap-3 border rounded-md p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{s.title}</span>
                            <Badge variant="outline">{s.category}</Badge>
                            <Badge variant="secondary">{s.source_type}</Badge>
                            <StatusBadge status={s.status} />
                            <span className="text-xs text-muted-foreground">
                              {s.chunk_count} chunks
                            </span>
                          </div>
                          {s.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {s.description}
                            </p>
                          )}
                          {s.source_url && (
                            <a
                              href={s.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs inline-flex items-center gap-1 text-primary mt-1"
                            >
                              <LinkIcon className="h-3 w-3" />
                              {s.source_url}
                            </a>
                          )}
                          {s.error && (
                            <p className="text-xs text-destructive mt-1">{s.error}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void onDelete(s.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="add" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Adicionar conhecimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Apresentação institucional JCS"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      value={category}
                      onValueChange={(v) => setCategory(v as typeof category)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KNOWLEDGE_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de fonte</Label>
                    <Select
                      value={sourceType}
                      onValueChange={(v) => setSourceType(v as typeof sourceType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Breve descrição"
                    />
                  </div>
                </div>

                {sourceType === "url" ? (
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Conteúdo</Label>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
                          className="hidden"
                          onChange={(e) => void onFileSelected(e)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={parsingFile}
                        >
                          <Paperclip className="mr-2 h-4 w-4" />
                          {parsingFile ? "Lendo arquivo..." : "Anexar arquivo (PDF, Word, Excel)"}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={10}
                      placeholder="Cole aqui o texto do documento, FAQs, transcrição..."
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{fileTypeHint}</p>

                <Button onClick={() => void onCreate()} disabled={creating}>
                  {creating ? "Indexando..." : "Indexar"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ask" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Conversar com a base</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onAsk();
                    }}
                    placeholder="Ex: Qual o diferencial da JCS?"
                  />
                  <Button onClick={() => void onAsk()} disabled={asking}>
                    {asking ? "Buscando..." : "Perguntar"}
                  </Button>
                </div>
                {answer && (
                  <div className="space-y-3">
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">
                      {answer.answer}
                    </div>
                    {answer.sources.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Fontes utilizadas</p>
                        {answer.sources.map((s) => (
                          <div
                            key={s.index}
                            className="rounded-md border p-2 text-xs space-y-1"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">[{s.index}]</Badge>
                              <span className="font-medium">{s.title}</span>
                              <Badge variant="secondary">{s.category}</Badge>
                              <span className="text-muted-foreground">
                                {(s.similarity * 100).toFixed(0)}% match
                              </span>
                            </div>
                            <p className="text-muted-foreground">{s.excerpt}…</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge>indexado</Badge>;
  if (status === "processing") return <Badge variant="secondary">processando</Badge>;
  if (status === "failed") return <Badge variant="destructive">falhou</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}