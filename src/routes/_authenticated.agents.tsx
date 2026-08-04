import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  User as UserIcon,
  Briefcase,
  GraduationCap,
  Target,
  Radio,
  Settings as SettingsIcon,
  Sparkles,
  Plus,
  Trash2,
  Check,
  Paperclip,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  deleteAgent,
  deleteTraining,
  listAgents,
  listTrainings,
  upsertAgent,
  upsertTraining,
} from "@/lib/agents.functions";
import {
  listAgentTemplates,
  createAgentFromTemplate,
} from "@/lib/agent-templates.functions";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agentes — JCS SDR" }] }),
  component: AgentsPage,
});

type Agent = Record<string, any> & { id: string; name: string };
type Training = Record<string, any> & { id: string };
type AgentTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  agent_type: string | null;
  channel_priority: string | null;
  use_case: string | null;
  icon: string | null;
};

// ===== Catálogo de modelos (API OpenAI compatível) =====
type ModelDef = { id: string; label: string; credits: number; tag?: "novo" | "depreciado" };
const PROVIDERS: { id: string; label: string; available: boolean; models: ModelDef[] }[] = [
  {
    id: "google",
    label: "Google",
    available: true,
    models: [
      { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", credits: 1, tag: "novo" },
      { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", credits: 2 },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", credits: 5 },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", credits: 2 },
      { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", credits: 1 },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    available: true,
    models: [
      { id: "openai/gpt-5", label: "GPT-5", credits: 10 },
      { id: "openai/gpt-5-mini", label: "GPT-5 Mini", credits: 5 },
      { id: "openai/gpt-5-nano", label: "GPT-5 Nano", credits: 2 },
      { id: "openai/gpt-5.2", label: "GPT-5.2", credits: 10, tag: "novo" },
    ],
  },
  { id: "anthropic", label: "Anthropic (em breve)", available: false, models: [] },
  { id: "meta", label: "Meta (em breve)", available: false, models: [] },
  { id: "deepseek", label: "Deepseek (em breve)", available: false, models: [] },
];

function findModel(modelId?: string | null) {
  for (const p of PROVIDERS) {
    const m = p.models.find((x) => x.id === modelId);
    if (m) return { provider: p, model: m };
  }
  return { provider: PROVIDERS[0], model: PROVIDERS[0].models[0] };
}

function emptyAgent(): Agent {
  return {
    id: "",
    name: "",
    role_title: "",
    company: "",
    description: "",
    campaign_goal: "",
    personality:
      "Seja humano, direto e consultivo. Use linguagem simples, natural e profissional.",
    product: "",
    training_notes: "",
    objections: "",
    llm_provider: "google",
    llm_model: "google/gemini-3-flash-preview",
    context_multiplier: 1,
    communication_style: "normal",
    avatar_url: "",
    signature: "",
    timezone: "America/Sao_Paulo",
    response_delay_seconds: 5,
    interaction_limit: 50,
    limit_action: "block_5m",
    allow_emojis: true,
    sign_responses: true,
    restrict_topics: true,
    split_messages: true,
    allow_reminders: true,
    smart_training_search: false,
    transfer_to_human: true,
    transfer_summary: true,
    business_hours: {},
    inactivity_actions: [],
    webhooks: [],
    transfer_rules: [],
    intents: [],
    channels: [],
    active: true,
  };
}

function AgentsPage() {
  const list = useServerFn(listAgents);
  const saveAgent = useServerFn(upsertAgent);
  const removeAgent = useServerFn(deleteAgent);
  const fetchTemplates = useServerFn(listAgentTemplates);
  const createFromTemplate = useServerFn(createAgentFromTemplate);
  const [items, setItems] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Agent>(emptyAgent());
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [creatingSlug, setCreatingSlug] = useState<string | null>(null);

  async function reload(keepId?: string | null) {
    const r = await list();
    const arr = (r.items as Agent[]) ?? [];
    setItems(arr);
    if (keepId) {
      const f = arr.find((a) => a.id === keepId);
      if (f) {
        setForm({ ...emptyAgent(), ...f });
        setSelectedId(f.id);
      }
    }
  }

  useEffect(() => {
    reload().catch((e) => toast.error((e as Error).message));
    fetchTemplates()
      .then((r) => setTemplates((r.items as AgentTemplate[]) ?? []))
      .catch(() => {});
  }, []);

  function selectAgent(a: Agent) {
    setSelectedId(a.id);
    setForm({ ...emptyAgent(), ...a });
  }

  function newAgent() {
    setSelectedId(null);
    setForm(emptyAgent());
  }

  async function save() {
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.id) delete payload.id;
      const res = await saveAgent({ data: payload });
      toast.success("Agente salvo");
      await reload(res.id ?? selectedId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir agente?")) return;
    await removeAgent({ data: { id } });
    if (selectedId === id) newAgent();
    await reload();
  }

  async function useTemplate(slug: string) {
    setCreatingSlug(slug);
    try {
      const res = await createFromTemplate({ data: { slug } });
      toast.success("Agente criado a partir do modelo. Revise e ative.");
      await reload(res.id ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreatingSlug(null);
    }
  }

  const set = (patch: Partial<Agent>) => setForm((f) => ({ ...f, ...patch }));
  const activeCount = items.filter((agent) => agent.active).length;

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Agentes de IA"
        description="Crie, treine e configure agentes para campanhas e cadências"
        action={
          <Button onClick={newAgent} className="gap-2">
            <Plus className="size-4" /> Novo agente
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-blue-200/70 bg-gradient-to-br from-blue-50 to-card"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Agentes cadastrados</p><p className="mt-1 text-2xl font-bold text-blue-700">{items.length}</p></CardContent></Card>
        <Card className="border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-card"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Agentes ativos</p><p className="mt-1 text-2xl font-bold text-emerald-700">{activeCount}</p></CardContent></Card>
        <Card className="border-violet-200/70 bg-gradient-to-br from-violet-50 to-card"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">Modelo selecionado</p><p className="mt-1 truncate text-sm font-semibold text-violet-700">{findModel(form.llm_model).model.label}</p></CardContent></Card>
      </div>

      {templates.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold">Criar a partir de modelo</h2>
              <p className="text-xs text-muted-foreground">
                Modelos prontos da JCS — prompt base, qualificação e treinamentos iniciais.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {templates.map((t) => (
              <Card key={t.id} className="flex flex-col">
                <CardContent className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <Sparkles className="size-4 text-primary" />
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t.channel_priority || t.agent_type}
                    </div>
                  </div>
                  <div className="font-semibold text-sm leading-snug">{t.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-3 flex-1">
                    {t.description}
                  </div>
                  {t.use_case && (
                    <div className="text-[11px] text-muted-foreground italic">{t.use_case}</div>
                  )}
                  <Button
                    size="sm"
                    className="mt-2 w-full"
                    disabled={creatingSlug === t.slug}
                    onClick={() => useTemplate(t.slug)}
                  >
                    {creatingSlug === t.slug ? "Criando..." : "Usar modelo"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Lista lateral de agentes */}
        <Card className="overflow-hidden xl:sticky xl:top-5">
          <div className="border-b bg-muted/40 px-4 py-3"><p className="text-sm font-semibold">Seus agentes</p><p className="text-xs text-muted-foreground">Selecione um agente para editar</p></div>
          <CardContent className="max-h-[52vh] space-y-1 overflow-y-auto p-2 xl:max-h-[calc(100vh-15rem)]">
            {items.length === 0 && (
              <div className="text-xs text-muted-foreground p-3">Nenhum agente ainda.</div>
            )}
            {items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => selectAgent(a)}
                className={
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 " +
                  (selectedId === a.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "hover:bg-blue-50 hover:text-blue-900")
                }
              >
                <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                  {a.name?.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.role_title || a.company || "Sem cargo"}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Editor com abas */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between gap-3 border-b bg-gradient-to-r from-slate-50 to-blue-50/60 px-5 py-4">
              <div className="text-sm">
                <span className="text-muted-foreground">Status: </span>
                <span className={form.active ? "text-emerald-600 font-medium" : "text-muted-foreground font-medium"}>
                  {form.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="agent-active" className="text-xs">Ativar agente</Label>
                <Switch id="agent-active" checked={!!form.active} onCheckedChange={(v) => set({ active: v })} />
              </div>
            </div>
            <Tabs defaultValue="perfil" className="flex flex-col lg:flex-row">
              <TabsList className="flex h-auto items-stretch gap-1 overflow-x-auto rounded-none bg-slate-50/80 p-2 lg:w-48 lg:min-w-48 lg:flex-col lg:overflow-visible">
                <TabsTrigger value="perfil" className="justify-start gap-2 shrink-0">
                  <UserIcon className="size-4" /> Perfil
                </TabsTrigger>
                <TabsTrigger value="trabalho" className="justify-start gap-2 shrink-0">
                  <Briefcase className="size-4" /> Trabalho
                </TabsTrigger>
                <TabsTrigger value="treinamentos" className="justify-start gap-2 shrink-0">
                  <GraduationCap className="size-4" /> Treinamentos
                </TabsTrigger>
                <TabsTrigger value="intencoes" className="justify-start gap-2 shrink-0">
                  <Target className="size-4" /> Intenções
                </TabsTrigger>
                <TabsTrigger value="canais" className="justify-start gap-2 shrink-0">
                  <Radio className="size-4" /> Canais
                </TabsTrigger>
                <TabsTrigger value="config" className="justify-start gap-2 shrink-0">
                  <SettingsIcon className="size-4" /> Configurações
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 p-4 sm:p-6 min-w-0">
                <TabsContent value="perfil" className="m-0 space-y-4">
                  <PerfilTab form={form} set={set} />
                </TabsContent>
                <TabsContent value="trabalho" className="m-0 space-y-4">
                  <TrabalhoTab form={form} set={set} />
                </TabsContent>
                <TabsContent value="treinamentos" className="m-0">
                  <TreinamentosTab agentId={selectedId} />
                </TabsContent>
                <TabsContent value="intencoes" className="m-0 space-y-4">
                  <IntencoesTab form={form} set={set} />
                </TabsContent>
                <TabsContent value="canais" className="m-0 space-y-4">
                  <CanaisTab form={form} set={set} />
                </TabsContent>
                <TabsContent value="config" className="m-0 space-y-4">
                  <ConfigTab form={form} set={set} />
                </TabsContent>

                <div className="flex items-center justify-between gap-2 pt-6 mt-6 border-t">
                  <div className="text-xs text-muted-foreground">
                    {selectedId ? "Editando agente existente" : "Novo agente"}
                  </div>
                  <div className="flex gap-2">
                    {selectedId && (
                      <Button variant="ghost" onClick={() => remove(selectedId)} className="text-destructive">
                        <Trash2 className="size-4 mr-1.5" /> Excluir
                      </Button>
                    )}
                    <Button onClick={save} disabled={saving || !form.name}>
                      {saving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============= Abas =============

function PerfilTab({ form, set }: { form: Agent; set: (p: Partial<Agent>) => void }) {
  const [modelOpen, setModelOpen] = useState(false);
  const { model } = findModel(form.llm_model);

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-6">
      {/* coluna esquerda — avatar + modelo */}
      <div className="space-y-4 min-w-0">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="size-24 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-3xl font-semibold">
            {form.name?.slice(0, 1).toUpperCase() || "A"}
          </div>
          <div>
            <div className="font-semibold">{form.name || "Sem nome"}</div>
            <div className="text-xs text-muted-foreground">
              {form.role_title || "Cargo"} {form.company ? `em ${form.company}` : ""}
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setModelOpen(true)}
          >
            <Sparkles className="size-3.5" /> {model.label}
          </Button>
        </div>
      </div>

      {/* coluna direita — informações pessoais */}
      <div className="space-y-5 min-w-0">
        <div>
          <h3 className="font-semibold mb-3">Informações pessoais</h3>
          <div className="space-y-3">
            <Field label="Nome do agente" value={form.name} onChange={(v) => set({ name: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cargo" value={form.role_title} onChange={(v) => set({ role_title: v })} />
              <Field label="Empresa" value={form.company} onChange={(v) => set({ company: v })} />
            </div>
          </div>
        </div>

        <div>
          <Label>Comunicação</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {(["formal", "normal", "descontraida"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set({ communication_style: s })}
                className={
                  "px-2 py-2 text-[11px] font-medium uppercase rounded-md border transition truncate " +
                  (form.communication_style === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent")
                }
              >
                {s === "descontraida" ? "Descontraída" : s === "formal" ? "Formal" : "Normal"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Comportamento</Label>
            <span className="text-xs text-muted-foreground">{(form.personality || "").length}/3000</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            Descreva como o agente deve se comportar durante a conversa.
          </p>
          <Textarea
            rows={10}
            maxLength={3000}
            value={form.personality || ""}
            onChange={(e) => set({ personality: e.target.value })}
          />
        </div>

        <Field label="Assinatura nas respostas" value={form.signature} onChange={(v) => set({ signature: v })} />
      </div>

      <ModelPickerDialog
        open={modelOpen}
        onOpenChange={setModelOpen}
        provider={form.llm_provider || "google"}
        model={form.llm_model || "google/gemini-3-flash-preview"}
        multiplier={form.context_multiplier || 1}
        onSave={({ provider, model, multiplier }) => {
          set({ llm_provider: provider, llm_model: model, context_multiplier: multiplier });
          setModelOpen(false);
        }}
      />
    </div>
  );
}

function TrabalhoTab({ form, set }: { form: Agent; set: (p: Partial<Agent>) => void }) {
  return (
    <div className="space-y-4">
      <Area label="Descrição" value={form.description} onChange={(v) => set({ description: v })} />
      <Area label="Objetivo da campanha" value={form.campaign_goal} onChange={(v) => set({ campaign_goal: v })} />
      <Area label="Produto / oferta" value={form.product} onChange={(v) => set({ product: v })} />
      <Area label="Objeções comuns" value={form.objections} onChange={(v) => set({ objections: v })} />
      <Area label="Notas de treinamento (texto livre)" value={form.training_notes} onChange={(v) => set({ training_notes: v })} />
    </div>
  );
}

function TreinamentosTab({ agentId }: { agentId: string | null }) {
  const listFn = useServerFn(listTrainings);
  const saveFn = useServerFn(upsertTraining);
  const delFn = useServerFn(deleteTraining);
  const [items, setItems] = useState<Training[]>([]);
  const [kind, setKind] = useState<"text" | "website" | "document" | "video" | "audio">("text");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsingFile, setParsingFile] = useState(false);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsingFile(true);
    try {
      const name = file.name.toLowerCase();
      let text = "";
      if (name.endsWith(".pdf")) {
        const pdfjs: any = await import("pdfjs-dist");
        const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")) as { default: string };
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc.default;
        const buf = await file.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const chunks: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          chunks.push(tc.items.map((it: any) => ("str" in it ? it.str : "")).join(" "));
        }
        text = chunks.join("\n\n");
      } else if (name.endsWith(".docx") || name.endsWith(".doc")) {
        const mammoth: any = await import("mammoth");
        const buf = await file.arrayBuffer();
        const r = await mammoth.extractRawText({ arrayBuffer: buf });
        text = r.value || "";
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
        const XLSX: any = await import("xlsx");
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const parts: string[] = [];
        for (const sn of wb.SheetNames) {
          parts.push(`# ${sn}\n${XLSX.utils.sheet_to_csv(wb.Sheets[sn])}`);
        }
        text = parts.join("\n\n");
      } else if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
        const maxBytes = 8 * 1024 * 1024;
        if (file.size > maxBytes) {
          toast.error(`Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo 8MB — use uma URL externa.`);
          return;
        }
        const dataUrl: string = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        });
        setUrl(dataUrl);
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
        toast.success(`Arquivo "${file.name}" anexado (${(file.size / 1024).toFixed(0)} KB)`);
        return;
      } else {
        text = await file.text();
      }
      setContent((prev) => (prev ? prev + "\n\n" + text : text));
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast.success(`Arquivo "${file.name}" lido (${text.length} caracteres)`);
    } catch (err) {
      toast.error("Falha ao ler arquivo: " + (err as Error).message);
    } finally {
      setParsingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function reload() {
    if (!agentId) return;
    const r = await listFn({ data: { agentId } });
    setItems((r.items as Training[]) ?? []);
  }

  useEffect(() => {
    setItems([]);
    if (agentId) reload().catch((e) => toast.error((e as Error).message));
  }, [agentId]);

  async function add() {
    if (!agentId) return toast.error("Salve o agente primeiro.");
    if (kind === "text" && !content.trim()) return;
    if ((kind === "website" || kind === "video" || kind === "audio" || kind === "document") && !url.trim() && !content.trim())
      return toast.error("Informe URL ou conteúdo.");
    try {
      await saveFn({
        data: { agent_id: agentId, kind, title: title || null, content: content || null, url: url || null },
      });
      setContent("");
      setUrl("");
      setTitle("");
      await reload();
      toast.success("Treinamento adicionado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    await delFn({ data: { id } });
    await reload();
  }

  if (!agentId) {
    return (
      <div className="text-sm text-muted-foreground">
        Salve o agente antes de adicionar treinamentos.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Tabs value={kind} onValueChange={(v) => setKind(v as any)}>
        <TabsList>
          <TabsTrigger value="text">Texto</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="document">Documento</TabsTrigger>
          <TabsTrigger value="video">Vídeo</TabsTrigger>
          <TabsTrigger value="audio">Áudio</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3 border rounded-md p-4">
        <Field label="Título (opcional)" value={title} onChange={setTitle} />
        {kind === "text" ? (
          <Area label="Conteúdo / afirmação" value={content} onChange={setContent} />
        ) : (
          <>
            <Field
              label={
                kind === "website"
                  ? "URL do site"
                  : kind === "document"
                  ? "URL do documento (PDF/DOCX)"
                  : kind === "video"
                  ? "URL do vídeo"
                  : "URL do áudio"
              }
              value={url}
              onChange={setUrl}
            />
            {(kind === "document" || kind === "video" || kind === "audio") && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    kind === "document"
                      ? ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
                      : kind === "video"
                      ? "video/*"
                      : "audio/*"
                  }
                  className="hidden"
                  onChange={onFileSelected}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={parsingFile}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                  {parsingFile
                    ? "Lendo arquivo..."
                    : kind === "document"
                    ? "Anexar arquivo (PDF, Word, Excel)"
                    : kind === "video"
                    ? "Anexar vídeo (até 8MB)"
                    : "Anexar áudio (até 8MB)"}
                </Button>
              </div>
            )}
            <Area label="Notas adicionais (opcional)" value={content} onChange={setContent} />
          </>
        )}
        <Button onClick={add} className="gap-1.5">
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">{items.length} item(s)</div>
        {items.map((t) => (
          <div key={t.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.kind}</div>
              <div className="text-sm font-medium truncate">{t.title || t.url || (t.content?.slice(0, 80) ?? "—")}</div>
              {t.url && <div className="text-xs text-muted-foreground truncate">{t.url}</div>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntencoesTab({ form, set }: { form: Agent; set: (p: Partial<Agent>) => void }) {
  const intents: any[] = Array.isArray(form.intents) ? form.intents : [];
  function update(i: number, patch: any) {
    const next = intents.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    set({ intents: next });
  }
  function add() {
    set({ intents: [...intents, { name: "", description: "", action: "responder" }] });
  }
  function remove(i: number) {
    set({ intents: intents.filter((_, idx) => idx !== i) });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Defina intenções que o agente deve identificar e como reagir.
      </p>
      {intents.map((it: any, i: number) => (
        <div key={i} className="border rounded-md p-3 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Nome (ex: pediu_orcamento)"
              value={it.name || ""}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <Input
              placeholder="Ação (ex: transferir, responder)"
              value={it.action || ""}
              onChange={(e) => update(i, { action: e.target.value })}
            />
            <Button variant="ghost" size="icon" onClick={() => remove(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Textarea
            placeholder="Descrição"
            rows={2}
            value={it.description || ""}
            onChange={(e) => update(i, { description: e.target.value })}
          />
        </div>
      ))}
      <Button variant="outline" onClick={add} className="gap-1.5">
        <Plus className="size-4" /> Adicionar intenção
      </Button>
    </div>
  );
}

function CanaisTab({ form, set }: { form: Agent; set: (p: Partial<Agent>) => void }) {
  const ALL = ["whatsapp", "email", "sms"];
  const enabled: string[] = Array.isArray(form.channels) ? form.channels : [];
  function toggle(c: string) {
    set({ channels: enabled.includes(c) ? enabled.filter((x) => x !== c) : [...enabled, c] });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Canais que o agente pode usar.</p>
      {ALL.map((c) => (
        <div key={c} className="flex items-center justify-between border rounded-md p-3">
          <div className="capitalize font-medium">{c}</div>
          <Switch checked={enabled.includes(c)} onCheckedChange={() => toggle(c)} />
        </div>
      ))}
    </div>
  );
}

function ConfigTab({ form, set }: { form: Agent; set: (p: Partial<Agent>) => void }) {
  const ToggleRow = ({
    label,
    description,
    field,
  }: {
    label: string;
    description: string;
    field: keyof Agent;
  }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch
        checked={Boolean(form[field])}
        onCheckedChange={(v) => set({ [field]: v } as Partial<Agent>)}
      />
    </div>
  );

  return (
    <Tabs defaultValue="conversa">
      <TabsList>
        <TabsTrigger value="conversa">Conversa</TabsTrigger>
        <TabsTrigger value="inatividade">Ações de inatividade</TabsTrigger>
        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        <TabsTrigger value="transferencia">Regras de transferência</TabsTrigger>
      </TabsList>

      <TabsContent value="conversa" className="mt-4">
        <ToggleRow label="Transferir para humano" description="Permite transferir para a equipe humana." field="transfer_to_human" />
        <ToggleRow label="Resumo ao transferir" description="Gera resumo automático ao transferir." field="transfer_summary" />
        <ToggleRow label="Usar emojis nas respostas" description="Define se o agente pode usar emojis." field="allow_emojis" />
        <ToggleRow label="Assinar nome do agente" description="Adiciona assinatura nas respostas." field="sign_responses" />
        <ToggleRow label="Restringir temas" description="Não fala sobre assuntos fora do escopo." field="restrict_topics" />
        <ToggleRow label="Dividir resposta em partes" description="Separa mensagens longas." field="split_messages" />
        <ToggleRow label="Permitir lembretes" description="Pode registrar lembretes do usuário." field="allow_reminders" />
        <ToggleRow label="Busca inteligente no treinamento" description="Consulta a base no momento certo." field="smart_training_search" />

        <div className="grid grid-cols-2 gap-4 pt-4">
          <div>
            <Label>Timezone</Label>
            <Select value={form.timezone || "America/Sao_Paulo"} onValueChange={(v) => set({ timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">(GMT-03:00) São Paulo</SelectItem>
                <SelectItem value="America/New_York">(GMT-05:00) New York</SelectItem>
                <SelectItem value="Europe/Lisbon">(GMT+00:00) Lisboa</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tempo de resposta</Label>
            <Select
              value={String(form.response_delay_seconds ?? 5)}
              onValueChange={(v) => set({ response_delay_seconds: Number(v) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 2, 5, 10, 15, 30, 60].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} segundos</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Limite de interações por atendimento</Label>
            <Select
              value={String(form.interaction_limit ?? 50)}
              onValueChange={(v) => set({ interaction_limit: Number(v) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} interações</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ação ao atingir limite</Label>
            <Select value={form.limit_action || "block_5m"} onValueChange={(v) => set({ limit_action: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="block_5m">Bloquear por 5m</SelectItem>
                <SelectItem value="block_1h">Bloquear por 1h</SelectItem>
                <SelectItem value="transfer">Transferir para humano</SelectItem>
                <SelectItem value="end">Finalizar atendimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="inatividade" className="mt-4">
        <InactivityEditor form={form} set={set} />
      </TabsContent>

      <TabsContent value="webhooks" className="mt-4">
        <ListEditor
          title="Webhooks"
          empty="Adicione URLs que receberão eventos do agente."
          items={Array.isArray(form.webhooks) ? form.webhooks : []}
          onChange={(v) => set({ webhooks: v })}
          fields={[
            { key: "event", placeholder: "Evento (ex: message.created)" },
            { key: "url", placeholder: "https://..." },
          ]}
        />
      </TabsContent>

      <TabsContent value="transferencia" className="mt-4">
        <ListEditor
          title="Regras de transferência"
          empty="Quando transferir o atendimento para um humano."
          items={Array.isArray(form.transfer_rules) ? form.transfer_rules : []}
          onChange={(v) => set({ transfer_rules: v })}
          fields={[
            { key: "condition", placeholder: "Condição (ex: cliente pediu humano)" },
            { key: "team", placeholder: "Equipe / fila" },
          ]}
        />
      </TabsContent>
    </Tabs>
  );
}

function InactivityEditor({ form, set }: { form: Agent; set: (p: Partial<Agent>) => void }) {
  const items: any[] = Array.isArray(form.inactivity_actions) ? form.inactivity_actions : [];
  function update(i: number, patch: any) {
    set({ inactivity_actions: items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  }
  function add() {
    set({ inactivity_actions: [...items, { after_minutes: 5, action: "engage", message: "" }] });
  }
  function remove(i: number) {
    set({ inactivity_actions: items.filter((_, idx) => idx !== i) });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Configure ações que o agente deve executar quando o cliente parar de responder.
      </p>
      {items.map((it, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2">
          <div className="flex gap-2 items-center">
            <span className="text-xs">Se não responder em</span>
            <Select value={String(it.after_minutes ?? 5)} onValueChange={(v) => update(i, { after_minutes: Number(v) })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 5, 10, 30, 60, 120].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} minutos</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs">o agente deve</span>
            <Select value={it.action || "engage"} onValueChange={(v) => update(i, { action: v })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="engage">Interagir com cliente</SelectItem>
                <SelectItem value="finish">Finalizar atendimento</SelectItem>
                <SelectItem value="transfer">Transferir para humano</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => remove(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          {it.action === "engage" && (
            <Textarea
              rows={2}
              maxLength={512}
              placeholder="O que o agente deve falar?"
              value={it.message || ""}
              onChange={(e) => update(i, { message: e.target.value })}
            />
          )}
        </div>
      ))}
      <Button variant="outline" onClick={add} className="gap-1.5">
        <Plus className="size-4" /> Adicionar ação
      </Button>
    </div>
  );
}

function ListEditor({
  title,
  empty,
  items,
  onChange,
  fields,
}: {
  title: string;
  empty: string;
  items: any[];
  onChange: (v: any[]) => void;
  fields: { key: string; placeholder: string }[];
}) {
  function update(i: number, key: string, value: string) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  }
  function add() {
    onChange([...items, Object.fromEntries(fields.map((f) => [f.key, ""]))]);
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{empty}</p>
      {items.map((it, i) => (
        <div key={i} className="border rounded-md p-3 flex gap-2 items-center">
          {fields.map((f) => (
            <Input
              key={f.key}
              placeholder={f.placeholder}
              value={it[f.key] || ""}
              onChange={(e) => update(i, f.key, e.target.value)}
            />
          ))}
          <Button variant="ghost" size="icon" onClick={() => remove(i)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={add} className="gap-1.5">
        <Plus className="size-4" /> Adicionar
      </Button>
    </div>
  );
}

// ============= LLM Picker Dialog =============

function ModelPickerDialog({
  open,
  onOpenChange,
  provider,
  model,
  multiplier,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  provider: string;
  model: string;
  multiplier: number;
  onSave: (v: { provider: string; model: string; multiplier: number }) => void;
}) {
  const [p, setP] = useState(provider);
  const [m, setM] = useState(model);
  const [mult, setMult] = useState(multiplier);

  useEffect(() => {
    if (open) {
      setP(provider);
      setM(model);
      setMult(multiplier);
    }
  }, [open, provider, model, multiplier]);

  const current = PROVIDERS.find((x) => x.id === p) || PROVIDERS[0];
  const baseCredits = current.models.find((x) => x.id === m)?.credits ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Selecionar Modelo IA</DialogTitle>
          <DialogDescription>Escolha o modelo de IA e configure o tamanho do contexto.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[180px_1fr_240px] gap-4 min-h-[360px]">
          {/* Providers */}
          <div className="space-y-1 border-r pr-2">
            <div className="text-xs uppercase text-muted-foreground mb-2">Provedor</div>
            {PROVIDERS.map((pr) => (
              <button
                key={pr.id}
                type="button"
                disabled={!pr.available}
                onClick={() => {
                  setP(pr.id);
                  if (pr.models[0]) setM(pr.models[0].id);
                }}
                className={
                  "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition " +
                  (p === pr.id ? "bg-primary text-primary-foreground" : "hover:bg-accent") +
                  (pr.available ? "" : " opacity-50 cursor-not-allowed")
                }
              >
                {pr.label}
              </button>
            ))}
          </div>

          {/* Models */}
          <div className="space-y-2 overflow-auto max-h-[400px]">
            <div className="text-xs uppercase text-muted-foreground mb-2">Modelos disponíveis</div>
            {current.models.map((md) => {
              const selected = m === md.id;
              return (
                <button
                  key={md.id}
                  type="button"
                  onClick={() => setM(md.id)}
                  className={
                    "w-full text-left p-3 rounded-md border flex items-center justify-between transition " +
                    (selected ? "border-primary bg-primary/5" : "hover:bg-accent")
                  }
                >
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      {md.label}
                      {md.tag === "novo" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 uppercase">
                          Novo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{md.credits} créditos</div>
                  </div>
                  {selected && <Check className="size-4 text-primary" />}
                </button>
              );
            })}
          </div>

          {/* Multiplier */}
          <div className="space-y-3 border-l pl-4">
            <div className="text-xs uppercase text-muted-foreground">Multiplicador de contexto</div>
            <p className="text-xs text-muted-foreground">
              Define a capacidade de memória e comportamento do agente.
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMult(n)}
                  className={
                    "py-2 rounded-md text-sm border transition " +
                    (mult === n ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")
                  }
                >
                  {n}x
                </button>
              ))}
            </div>
            <div className="border rounded-md p-3 text-xs space-y-1">
              <div>• {20 * mult} mensagens de histórico</div>
              <div>• {3 * mult}k de comportamento/instruções</div>
            </div>
            <div className="border rounded-md p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Créditos base</span><span>{baseCredits}</span></div>
              <div className="flex justify-between"><span>Multiplicador</span><span>x{mult}</span></div>
              <div className="flex justify-between font-semibold text-primary pt-1 border-t mt-1">
                <span>Total por interação</span>
                <span>{baseCredits * mult} créditos</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave({ provider: p, model: m, multiplier: mult })}>Salvar configurações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============= Helpers =============

function Field({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Area({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea rows={4} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
