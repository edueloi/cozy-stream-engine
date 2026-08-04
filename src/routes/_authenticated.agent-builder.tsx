import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, ChevronRight, ChevronLeft, Wand2, Bot } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateAgentSpec,
  createAgentFromSpec,
  getBuilderStats,
  BUILDER_TEMPLATES,
  type AgentBuilderWizard,
  type AgentSpec,
} from "@/lib/agent-builder.functions";

export const Route = createFileRoute("/_authenticated/agent-builder")({
  head: () => ({ meta: [{ title: "Agent Builder — JCS SDR" }] }),
  component: AgentBuilderPage,
});

const STEPS = [
  "Objetivo",
  "Canal",
  "Público",
  "ICP",
  "Produtos",
  "Objeções",
  "Personalidade",
  "Handoff",
  "Conhecimento",
  "Cadência",
] as const;

function AgentBuilderPage() {
  const navigate = useNavigate();
  const generateFn = useServerFn(generateAgentSpec);
  const createFn = useServerFn(createAgentFromSpec);
  const statsFn = useServerFn(getBuilderStats);

  const [stats, setStats] = useState<{ total: number; active: number } | null>(null);
  const [step, setStep] = useState(0);
  const [w, setW] = useState<AgentBuilderWizard>({
    goal: "SDR",
    channel: "whatsapp",
    audience: "b2b",
    icp: "",
    products: "",
    objections: "",
    personality: "consultiva",
    handoff_rules: "",
    use_knowledge: false,
    create_cadence: true,
  });
  const [spec, setSpec] = useState<AgentSpec | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    statsFn().then((s) => setStats(s as typeof stats));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof AgentBuilderWizard>(k: K, v: AgentBuilderWizard[K]) {
    setW((p) => ({ ...p, [k]: v }));
  }

  function applyTemplate(t: (typeof BUILDER_TEMPLATES)[number]) {
    setW((p) => ({ ...p, goal: t.goal, icp: t.icp, products: t.products }));
    toast.success(`Template "${t.label}" aplicado. Ajuste os passos e gere.`);
  }

  async function onGenerate() {
    if (!w.icp.trim() || !w.products.trim()) {
      toast.error("Preencha ICP e Produtos");
      setStep(3);
      return;
    }
    setBusy(true);
    setSpec(null);
    try {
      const out = await generateFn({ data: w });
      setSpec(out as AgentSpec);
      toast.success("Especificação gerada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!spec) return;
    setBusy(true);
    try {
      const { id } = (await createFn({ data: { wizard: w, spec } })) as { id: string };
      toast.success("Agente criado");
      navigate({ to: "/agents" as never });
      void id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Agent Builder AI"
        description="Crie agentes especializados respondendo perguntas guiadas. A IA monta tudo."
      />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Agentes criados" value={stats?.total ?? 0} />
          <Stat label="Agentes ativos" value={stats?.active ?? 0} />
          <Stat label="Templates" value={BUILDER_TEMPLATES.length} />
          <Stat label="Etapas do wizard" value={STEPS.length} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templates rápidos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {BUILDER_TEMPLATES.map((t) => (
              <Button key={t.slug} variant="outline" size="sm" onClick={() => applyTemplate(t)}>
                <Bot className="mr-2 h-3 w-3" /> {t.label}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>
                Passo {step + 1} de {STEPS.length} — {STEPS[step]}
              </span>
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-6 rounded ${i <= step ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <Field label="Qual o objetivo do agente?">
                <Select value={w.goal} onValueChange={(v) => update("goal", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["SDR","Atendimento","Suporte","Cobrança","Pós-venda","RH","Marketing","Financeiro","Qualificação","Agendamento"].map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {step === 1 && (
              <Field label="Qual canal?">
                <Select value={w.channel} onValueChange={(v) => update("channel", v as AgentBuilderWizard["channel"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["whatsapp","email","voice","webchat","multicanal"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {step === 2 && (
              <Field label="Quem é o público?">
                <Select value={w.audience} onValueChange={(v) => update("audience", v as AgentBuilderWizard["audience"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="b2b">B2B</SelectItem>
                    <SelectItem value="b2c">B2C</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}
            {step === 3 && (
              <Field label="Qual é o ICP (perfil ideal de cliente)?">
                <Textarea
                  rows={3}
                  value={w.icp}
                  onChange={(e) => update("icp", e.target.value)}
                  placeholder="Ex: Empresas com mais de 10 computadores, setor de serviços, região SP"
                />
              </Field>
            )}
            {step === 4 && (
              <Field label="Quais produtos ou serviços ele representa?">
                <Textarea
                  rows={3}
                  value={w.products}
                  onChange={(e) => update("products", e.target.value)}
                  placeholder="Ex: Gestão de TI, suporte 24/7, segurança e backup gerenciado"
                />
              </Field>
            )}
            {step === 5 && (
              <Field label="Principais objeções (opcional, a IA infere se vazio)">
                <Textarea
                  rows={3}
                  value={w.objections}
                  onChange={(e) => update("objections", e.target.value)}
                  placeholder="Ex: já temos fornecedor, está caro, sem tempo agora"
                />
              </Field>
            )}
            {step === 6 && (
              <Field label="Personalidade">
                <Select value={w.personality} onValueChange={(v) => update("personality", v as AgentBuilderWizard["personality"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["formal","consultiva","tecnica","comercial","amigavel","executiva"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {step === 7 && (
              <Field label="Quando transferir para humano?">
                <Textarea
                  rows={3}
                  value={w.handoff_rules}
                  onChange={(e) => update("handoff_rules", e.target.value)}
                  placeholder="Ex: lead pediu reunião, mencionou contrato, dúvida técnica avançada"
                />
              </Field>
            )}
            {step === 8 && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Usar Central de Conhecimento (RAG)?</Label>
                  <p className="text-xs text-muted-foreground">
                    A IA usará seus documentos para contextualizar o agente.
                  </p>
                </div>
                <Switch checked={w.use_knowledge} onCheckedChange={(v) => update("use_knowledge", v)} />
              </div>
            )}
            {step === 9 && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Gerar cadência automaticamente?</Label>
                  <p className="text-xs text-muted-foreground">
                    Cria toques nos Dias 1, 3, 5 e 10.
                  </p>
                </div>
                <Switch checked={w.create_cadence} onCheckedChange={(v) => update("create_cadence", v)} />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                  Avançar <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => void onGenerate()} disabled={busy}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  {busy ? "Gerando..." : "Gerar especificação"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {spec && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Revisão: {spec.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">{spec.description}</p>

              <Section title="Prompt Mestre">
                <pre className="whitespace-pre-wrap text-xs bg-muted/40 p-3 rounded-md max-h-64 overflow-auto">
                  {spec.master_prompt}
                </pre>
              </Section>

              <div className="grid md:grid-cols-2 gap-3">
                <Section title="Pode fazer">
                  <List items={spec.rules_can} />
                </Section>
                <Section title="Não pode fazer">
                  <List items={spec.rules_cannot} />
                </Section>
                <Section title="Critérios de qualificação">
                  <List items={spec.qualification_criteria} />
                </Section>
                <Section title="Critérios de desqualificação">
                  <List items={spec.disqualification_criteria} />
                </Section>
              </div>

              <Section title="Objeções e respostas">
                <div className="space-y-2">
                  {spec.objections.map((o, i) => (
                    <div key={i} className="rounded border p-2">
                      <p className="font-medium">{o.objection}</p>
                      <p className="text-muted-foreground">{o.response}</p>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Mensagens iniciais">
                <div className="space-y-2">
                  <Msg label="WhatsApp" text={spec.initial_messages.whatsapp} />
                  <Msg
                    label="Email"
                    text={`Assunto: ${spec.initial_messages.email.subject}\n\n${spec.initial_messages.email.body}`}
                  />
                  <Msg label="Voz" text={spec.initial_messages.voice} />
                </div>
              </Section>

              {spec.cadence.length > 0 && (
                <Section title="Cadência">
                  <div className="space-y-2">
                    {spec.cadence.map((c, i) => (
                      <div key={i} className="rounded border p-2">
                        <div className="flex gap-2 items-center mb-1">
                          <Badge>Dia {c.day}</Badge>
                          <Badge variant="outline">{c.channel}</Badge>
                        </div>
                        <p className="whitespace-pre-wrap">{c.message}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="KPIs alvo">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary">Resposta {Math.round(spec.kpis.target_response_rate * 100)}%</Badge>
                  <Badge variant="secondary">Qualificação {Math.round(spec.kpis.target_qualification_rate * 100)}%</Badge>
                  <Badge variant="secondary">Agendamento {Math.round(spec.kpis.target_meeting_rate * 100)}%</Badge>
                </div>
              </Section>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => void onCreate()} disabled={busy}>
                  {busy ? "Criando..." : "Criar Agente"}
                </Button>
                <Button variant="outline" onClick={() => void onGenerate()} disabled={busy}>
                  Gerar novamente
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
      {items.map((i, idx) => (
        <li key={idx}>{i}</li>
      ))}
    </ul>
  );
}

function Msg({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded border p-2">
      <Badge variant="outline" className="mb-1">{label}</Badge>
      <p className="whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

// Silence unused Input import in some bundlers
void Input;