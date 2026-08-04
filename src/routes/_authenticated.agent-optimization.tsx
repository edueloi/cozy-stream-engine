import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getAgentOptimizationOverview,
  generateAgentOptimizationSuggestions,
  listAgentSuggestions,
  updateSuggestionStatus,
  getVariantComparison,
} from "@/lib/conversation-eval.functions";

export const Route = createFileRoute("/_authenticated/agent-optimization")({
  head: () => ({ meta: [{ title: "Otimização de Agentes — JCS SDR" }] }),
  component: AgentOptimizationPage,
});

type AgentOverview = {
  agentId: string;
  name: string;
  evaluations: number;
  avgScore: number | null;
  hotLeads: number;
  topObjections: Array<{ objection: string; count: number }>;
  channels: Array<{ channel: string; avg: number; count: number }>;
};

type Suggestion = {
  id: string;
  suggestion_type: string;
  suggestion_text: string;
  rationale: string | null;
  status: string;
  based_on_count: number;
  created_at: string;
};

type VariantCompare = {
  day: number;
  channel: string;
  variants: Array<{ key: string; sent: number; reply_rate: number; positive_rate: number }>;
  recommendation: string | null;
};

function AgentOptimizationPage() {
  const fetchOverview = useServerFn(getAgentOptimizationOverview);
  const generate = useServerFn(generateAgentOptimizationSuggestions);
  const fetchSuggestions = useServerFn(listAgentSuggestions);
  const updateStatus = useServerFn(updateSuggestionStatus);
  const fetchVariants = useServerFn(getVariantComparison);

  const [agents, setAgents] = useState<AgentOverview[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [variants, setVariants] = useState<VariantCompare[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadOverview() {
    setLoading(true);
    try {
      const data = (await fetchOverview()) as AgentOverview[];
      setAgents(data);
      if (!selected && data.length) setSelected(data[0].agentId);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuggestions(agentId: string) {
    const rows = (await fetchSuggestions({ data: { agentId } })) as Suggestion[];
    setSuggestions(rows);
  }

  async function loadVariants() {
    const rows = (await fetchVariants()) as VariantCompare[];
    setVariants(rows);
  }

  useEffect(() => {
    loadOverview();
    loadVariants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadSuggestions(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function handleGenerate() {
    if (!selected) return;
    setGenerating(true);
    try {
      const r = (await generate({ data: { agentId: selected } })) as { created: number };
      toast.success(`${r.created} sugestão(ões) gerada(s)`);
      await loadSuggestions(selected);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar");
    } finally {
      setGenerating(false);
    }
  }

  async function applyOrDismiss(id: string, status: "applied" | "dismissed") {
    await updateStatus({ data: { suggestionId: id, status } });
    if (selected) await loadSuggestions(selected);
    toast.success(status === "applied" ? "Sugestão marcada como aplicada" : "Sugestão descartada");
  }

  const current = agents.find((a) => a.agentId === selected) ?? null;

  return (
    <>
      <PageHeader
        title="Otimização de Agentes"
        description="Qualidade das conversas, sugestões de melhoria e A/B de cadências"
      />

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents">Agentes</TabsTrigger>
          <TabsTrigger value="ab">Comparação A/B</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!loading && agents.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum agente ativo ainda. Avaliações aparecerão aqui após interações.
              </p>
            )}
            {agents.map((a) => (
              <Card
                key={a.agentId}
                className={`cursor-pointer transition ${selected === a.agentId ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelected(a.agentId)}
              >
                <CardHeader>
                  <CardTitle className="text-base">{a.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div>
                    Score médio: <strong>{a.avgScore ?? "—"}</strong>
                  </div>
                  <div>Avaliações: {a.evaluations}</div>
                  <div>Leads quentes: {a.hotLeads}</div>
                  {a.topObjections.length > 0 && (
                    <div className="pt-1">
                      <div className="text-xs text-muted-foreground">Objeções comuns:</div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {a.topObjections.slice(0, 3).map((o) => (
                          <Badge key={o.objection} variant="secondary">
                            {o.objection} · {o.count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {current && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Sugestões para {current.name}</CardTitle>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? "Gerando…" : "Gerar sugestões IA"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {suggestions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma sugestão ainda. Gere com base nas últimas avaliações.
                  </p>
                )}
                {suggestions.map((s) => (
                  <div key={s.id} className="rounded border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge>{s.suggestion_type}</Badge>
                      <Badge
                        variant={
                          s.status === "applied"
                            ? "default"
                            : s.status === "dismissed"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {s.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        baseado em {s.based_on_count} avaliações
                      </span>
                    </div>
                    <p className="text-sm font-medium">{s.suggestion_text}</p>
                    {s.rationale && <p className="text-xs text-muted-foreground">{s.rationale}</p>}
                    {s.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => applyOrDismiss(s.id, "applied")}>
                          Aplicar sugestão
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => applyOrDismiss(s.id, "dismissed")}
                        >
                          Descartar
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ab" className="space-y-3">
          {variants.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sem comparações disponíveis. Crie ao menos 2 variantes por dia/canal.
            </p>
          )}
          {variants.map((v) => (
            <Card key={`${v.day}-${v.channel}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  Dia {v.day} · {v.channel}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid gap-2 md:grid-cols-2">
                  {v.variants.map((vr) => (
                    <div key={vr.key} className="rounded border p-3 text-sm">
                      <div className="font-medium">Variante {vr.key.toUpperCase()}</div>
                      <div>Enviados: {vr.sent}</div>
                      <div>Resposta: {(vr.reply_rate * 100).toFixed(1)}%</div>
                      <div>Positivas: {(vr.positive_rate * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
                {v.recommendation && (
                  <p className="text-sm text-emerald-600 font-medium">{v.recommendation}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}