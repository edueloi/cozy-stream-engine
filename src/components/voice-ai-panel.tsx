import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  startVoiceCall,
  listVoiceCalls,
  getVoiceCall,
  getVoiceDashboard,
  listVoiceAgents,
  listLeadsForVoice,
  updateAgentVoiceConfig,
} from "@/lib/voice-ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, PhoneOutgoing, Settings2, Sparkles, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Na fila", variant: "secondary" },
  calling: { label: "Discando", variant: "secondary" },
  answered: { label: "Atendida", variant: "default" },
  no_answer: { label: "Sem resposta", variant: "destructive" },
  busy: { label: "Ocupado", variant: "destructive" },
  failed: { label: "Falha", variant: "destructive" },
  completed: { label: "Concluída", variant: "outline" },
  simulated: { label: "Simulação", variant: "secondary" },
  qualified: { label: "Qualificado", variant: "default" },
  not_qualified: { label: "Não qualificado", variant: "outline" },
  callback_requested: { label: "Retorno", variant: "secondary" },
  opt_out: { label: "Opt-out", variant: "destructive" },
};

export function VoiceAiPanel() {
  const qc = useQueryClient();
  const dashFn = useServerFn(getVoiceDashboard);
  const callsFn = useServerFn(listVoiceCalls);
  const agentsFn = useServerFn(listVoiceAgents);
  const leadsFn = useServerFn(listLeadsForVoice);
  const startFn = useServerFn(startVoiceCall);
  const detailFn = useServerFn(getVoiceCall);

  const dash = useQuery({ queryKey: ["voice-dashboard"], queryFn: () => dashFn() });
  const calls = useQuery({ queryKey: ["voice-calls"], queryFn: () => callsFn() });
  const agents = useQuery({ queryKey: ["voice-agents"], queryFn: () => agentsFn() });
  const leads = useQuery({ queryKey: ["voice-leads"], queryFn: () => leadsFn() });

  const [selectedLead, setSelectedLead] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () => startFn({ data: { leadId: selectedLead, agentId: selectedAgent } }),
    onSuccess: (r) => {
      toast.success("Simulação concluída (nenhuma ligação real foi feita)");
      qc.invalidateQueries({ queryKey: ["voice-calls"] });
      qc.invalidateQueries({ queryKey: ["voice-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detail = useQuery({
    queryKey: ["voice-call", openDetailId],
    queryFn: () => detailFn({ data: { id: openDetailId! } }),
    enabled: !!openDetailId,
  });

  const voiceAgents = (agents.data ?? []).filter((a) => a.voice_enabled);

  return (
    <div className="space-y-6">
      <Alert variant="default" className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangle className="size-4 text-amber-600" />
        <AlertTitle>Modo simulação</AlertTitle>
        <AlertDescription>
          Esta aba ainda <strong>não realiza ligações reais</strong>. A "ligação IA" é uma
          simulação de conversa gerada por IA para treinar script e objeções. Nenhum lead é
          discado, nenhum status é alterado e nada é enviado ao Orbit. Para ligar de verdade
          precisamos integrar telefonia (Twilio + ElevenLabs Conversational AI via SIP) —
          peça quando quiser que eu monte essa infraestrutura.
        </AlertDescription>
      </Alert>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Realizadas" value={dash.data?.total ?? 0} />
        <Kpi label="Atendidas" value={dash.data?.answered ?? 0} />
        <Kpi label="Qualificados" value={dash.data?.qualified ?? 0} accent />
        <Kpi label="Conversão" value={`${dash.data?.conversion ?? 0}%`} />
        <Kpi label="Duração média" value={`${dash.data?.avgDurationSec ?? 0}s`} />
      </div>

      {/* Disparador */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Nova simulação de ligação IA
          </CardTitle>
          <VoiceAgentConfigDialog agents={agents.data ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["voice-agents"] })} />
        </CardHeader>
        <CardContent className="space-y-3">
          {voiceAgents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum agente com voz habilitada. Use o botão "Configurar voz" acima para ativar.
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Lead</Label>
              <Select value={selectedLead} onValueChange={setSelectedLead}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {(leads.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.nome_fantasia || l.razao_social || l.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agente de voz</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {voiceAgents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => start.mutate()}
            disabled={!selectedLead || !selectedAgent || start.isPending}
          >
            {start.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <PhoneOutgoing className="size-4 mr-1.5" />}
            Iniciar simulação
          </Button>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader><CardTitle>Histórico de ligações IA</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Qualidade</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(calls.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhuma ligação ainda.</TableCell></TableRow>
              )}
              {(calls.data ?? []).map((c) => {
                const lead = (c as { leads?: { nome_fantasia?: string; razao_social?: string } }).leads;
                const ag = (c as { ai_agents?: { name?: string } }).ai_agents;
                const status = c.call_status ?? "completed";
                const cfg = STATUS_LABEL[status] ?? { label: status, variant: "outline" as const };
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpenDetailId(c.id)}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</TableCell>
                    <TableCell>{lead?.nome_fantasia || lead?.razao_social || c.lead_id?.slice(0, 8)}</TableCell>
                    <TableCell>{ag?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                    <TableCell>{c.qualification_score ?? "—"}</TableCell>
                    <TableCell>{c.call_quality_score ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">Ver</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dash.data && dash.data.topObjections.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Objeções mais comuns</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {dash.data.topObjections.map((o) => (
              <Badge key={o.objection} variant="secondary">{o.objection} · {o.count}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Detalhe */}
      <Sheet open={!!openDetailId} onOpenChange={(o) => !o && setOpenDetailId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>Detalhe da ligação</SheetTitle></SheetHeader>
          {detail.isLoading && <p className="text-sm text-muted-foreground mt-4">Carregando…</p>}
          {detail.data && <CallDetail row={detail.data as never} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

type CallRow = {
  id: string;
  call_status: string | null;
  qualification_score: number | null;
  call_quality_score: number | null;
  intent: string | null;
  next_action: string | null;
  summary: string | null;
  objections_detected: string[] | null;
  voice_transcript: { role: string; text: string }[] | null;
};

function CallDetail({ row }: { row: CallRow }) {
  const cfg = STATUS_LABEL[row.call_status ?? ""] ?? { label: row.call_status ?? "—", variant: "outline" as const };
  return (
    <div className="mt-4 space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant={cfg.variant}>{cfg.label}</Badge>
        {row.qualification_score != null && <Badge variant="secondary">Score {row.qualification_score}</Badge>}
        {row.call_quality_score != null && <Badge variant="outline">Qualidade {row.call_quality_score}</Badge>}
        {row.intent && <Badge variant="outline">{row.intent}</Badge>}
      </div>
      {row.summary && (
        <div>
          <div className="font-medium mb-1">Resumo</div>
          <p className="text-muted-foreground">{row.summary}</p>
        </div>
      )}
      {row.next_action && (
        <div>
          <div className="font-medium mb-1">Próxima ação</div>
          <p className="text-muted-foreground">{row.next_action}</p>
        </div>
      )}
      {row.objections_detected && row.objections_detected.length > 0 && (
        <div>
          <div className="font-medium mb-1">Objeções</div>
          <div className="flex flex-wrap gap-1">
            {row.objections_detected.map((o, i) => <Badge key={i} variant="secondary">{o}</Badge>)}
          </div>
        </div>
      )}
      {row.voice_transcript && (
        <div>
          <div className="font-medium mb-1">Transcrição</div>
          <div className="space-y-2 max-h-96 overflow-y-auto rounded border p-3 bg-muted/30">
            {row.voice_transcript.map((t, i) => (
              <div key={i}>
                <span className={`font-medium ${t.role === "agent" ? "text-primary" : ""}`}>
                  {t.role === "agent" ? "Agente" : "Lead"}:
                </span>{" "}
                <span className="text-foreground">{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceAgentConfigDialog({
  agents,
  onSaved,
}: {
  agents: { id: string; name: string; voice_enabled: boolean | null; voice_config: unknown }[];
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateAgentVoiceConfig);
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [enabled, setEnabled] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [questions, setQuestions] = useState("");
  const [closingQ, setClosingQ] = useState("");
  const [closingNQ, setClosingNQ] = useState("");

  function loadAgent(id: string) {
    setAgentId(id);
    const a = agents.find((x) => x.id === id);
    if (!a) return;
    setEnabled(!!a.voice_enabled);
    const cfg = (a.voice_config as Record<string, unknown> | null) ?? {};
    setGreeting((cfg.greeting as string) ?? "");
    setQuestions(((cfg.qualification_questions as string[]) ?? []).join("\n"));
    setClosingQ((cfg.closing_qualified as string) ?? "");
    setClosingNQ((cfg.closing_not_qualified as string) ?? "");
  }

  const save = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          agentId,
          voiceEnabled: enabled,
          config: {
            greeting: greeting || undefined,
            qualification_questions: questions.split("\n").map((s) => s.trim()).filter(Boolean),
            closing_qualified: closingQ || undefined,
            closing_not_qualified: closingNQ || undefined,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Configuração de voz salva");
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Settings2 className="size-4 mr-1.5" />Configurar voz</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Configuração de Voz do Agente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Agente</Label>
            <Select value={agentId} onValueChange={loadAgent}>
              <SelectTrigger><SelectValue placeholder="Selecione um agente…" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {agentId && (
            <>
              <div className="flex items-center gap-3">
                <Switch checked={enabled} onCheckedChange={setEnabled} id="voice-enabled" />
                <Label htmlFor="voice-enabled">Voz habilitada</Label>
              </div>
              <div>
                <Label>Saudação</Label>
                <Textarea rows={3} value={greeting} onChange={(e) => setGreeting(e.target.value)} />
              </div>
              <div>
                <Label>Perguntas de qualificação (uma por linha)</Label>
                <Textarea rows={4} value={questions} onChange={(e) => setQuestions(e.target.value)} />
              </div>
              <div>
                <Label>Encerramento qualificado</Label>
                <Input value={closingQ} onChange={(e) => setClosingQ(e.target.value)} />
              </div>
              <div>
                <Label>Encerramento não qualificado</Label>
                <Input value={closingNQ} onChange={(e) => setClosingNQ(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!agentId || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin mr-1.5" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}