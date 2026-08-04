import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDiagnostics, runSelfCheck } from "@/lib/diagnostics.functions";
import { Copy, Download, RefreshCw, PlayCircle, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/diagnostics")({
  head: () => ({
    meta: [
      { title: "Diagnóstico do Sistema — JCS SDR" },
      { name: "description", content: "Centro de diagnóstico técnico do JCS SDR (SuperAdmin)." },
    ],
  }),
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const fn = useServerFn(getDiagnostics);
  const runFn = useServerFn(runSelfCheck);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () => fn(),
  });
  const [selfCheck, setSelfCheck] = useState<any>(null);
  const [running, setRunning] = useState(false);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando diagnóstico…</div>;
  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Diagnóstico" description="Restrito a SuperAdmin." />
        <Card><CardContent className="py-8 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
      </div>
    );
  }
  if (!data) return null;
  const d = data;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch {
      toast.error("Falha ao copiar");
    }
  }

  async function handleRun() {
    setRunning(true);
    try {
      const r = await runFn();
      setSelfCheck(r);
      toast.success(`Diagnóstico: ${r.level.toUpperCase()}`);
    } catch (e: any) {
      toast.error(e?.message ?? "erro");
    } finally {
      setRunning(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    downloadBlob(blob, `diagnostico-${new Date().toISOString().slice(0, 19)}.json`);
  }
  function exportTxt() {
    const lines: string[] = [];
    lines.push(`Diagnóstico JCS SDR — ${d.generatedAt}`);
    lines.push(`Release: ${d.release}  Ambiente: ${d.environment}`);
    lines.push(`Usuário: ${d.user.email} (${d.user.roles.join(", ")})`);
    lines.push(`Organização: ${d.organization.name ?? "—"} [${d.organization.id ?? "—"}]`);
    lines.push(`Fluxo: ${d.flow.current} — ${d.flow.reason}`);
    lines.push("");
    lines.push("Feature Flags:");
    for (const [k, v] of Object.entries(d.flags)) lines.push(`  ${k}: ${v ? "ON" : "OFF"}`);
    lines.push("");
    lines.push("Providers:");
    for (const p of d.providers)
      lines.push(`  ${p.name}: enabled=${p.enabled} priority=${p.priority ?? "—"} status=${p.status}`);
    lines.push("");
    lines.push("Checklist:");
    for (const c of d.checklist) lines.push(`  ${c.ok ? "OK" : "ERRO"}  ${c.item}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    downloadBlob(blob, `diagnostico-${new Date().toISOString().slice(0, 19)}.txt`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Diagnóstico do Sistema"
        description="Visão técnica completa. Somente SuperAdmin."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className="size-4 mr-1" /> Atualizar
            </Button>
            <Button size="sm" onClick={handleRun} disabled={running}>
              <PlayCircle className="size-4 mr-1" /> Executar diagnóstico
            </Button>
          </div>
        }
      />

      {/* CARD 1 — Identificação */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
          <KV label="Usuário" value={data.user.email || "—"} />
          <KV label="Papéis" value={data.user.roles.join(", ") || "—"} />
          <KV label="Organização" value={data.organization.name ?? "—"} />
          <KV label="Organization ID" value={data.organization.id ?? "—"} copyable onCopy={copy} />
          <KV label="Release" value={data.release} />
          <KV label="Ambiente" value={data.environment} />
        </CardContent>
      </Card>

      {/* CARD 2 — Feature Flags */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Feature Flags</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 text-sm">
          {Object.entries(data.flags).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between border rounded-md px-3 py-2">
              <code className="text-xs">{k}</code>
              <div className="flex items-center gap-2">
                <Badge variant={v ? "default" : "outline"}>{v ? "ON" : "OFF"}</Badge>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => copy(k)}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CARD 3 — Fluxo */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Fluxo da Prospecção</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={data.flow.current === "smart_flow" ? "default" : "secondary"}>
              {data.flow.current === "smart_flow" ? "Smart Flow" : "Fluxo Legado"}
            </Badge>
            <span className="text-muted-foreground">{data.flow.reason}</span>
          </div>
        </CardContent>
      </Card>

      {/* CARD 4 — Orchestrator */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Orchestrator</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
          <KV label="Status" value={
            <Badge variant={data.orchestrator.status === "error" ? "destructive" : data.orchestrator.status === "running" ? "default" : "outline"}>
              {data.orchestrator.status}
            </Badge>
          } />
          <KV label="Execuções" value={String(data.orchestrator.total)} />
          <KV label="Última execução" value={fmtDate(data.orchestrator.lastRunAt)} />
          <KV label="Tempo médio" value={data.orchestrator.avgDurationMs ? `${data.orchestrator.avgDurationMs} ms` : "—"} />
          <KV label="Fila" value={String(data.orchestrator.queued)} />
          <KV label="Retries" value={String(data.orchestrator.retries)} />
          <KV label="Fallbacks" value={String(data.orchestrator.fallbacks)} />
          <KV label="Cancelados" value={String(data.orchestrator.cancelled)} />
        </CardContent>
      </Card>

      {/* CARD 5 — Providers */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Provedores</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último teste</TableHead>
                <TableHead>Credencial</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Timeout</TableHead>
                <TableHead>Rate/min</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.providers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant={p.enabled ? "default" : "outline"}>{p.enabled ? "Sim" : "Não"}</Badge></TableCell>
                  <TableCell>{p.priority ?? "—"}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(p.lastTestedAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.credentialHint}</TableCell>
                  <TableCell className="text-xs">{p.credentialSource}</TableCell>
                  <TableCell>{p.timeoutMs ? `${p.timeoutMs} ms` : "—"}</TableCell>
                  <TableCell>{p.rateLimitPerMin ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CARD 6 — Capabilities */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Capabilities</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                <TableHead>Provider primário</TableHead>
                <TableHead>Fallback</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.capabilities.map((c) => (
                <TableRow key={c.capability}>
                  <TableCell className="font-mono text-xs">{c.capability}</TableCell>
                  <TableCell>{c.primary ?? <span className="text-muted-foreground">nenhum</span>}</TableCell>
                  <TableCell>{c.fallback ?? <span className="text-muted-foreground">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* CARD 8 — Health */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Saúde do Sistema</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 text-sm">
          {data.health.map((h) => (
            <div key={h.name} className="flex items-center justify-between border rounded-md px-3 py-2">
              <span>{h.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{h.note}</span>
                <Dot color={h.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CARD 9 — Integrações */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Integrações</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 text-sm">
          {data.integrations.map((i) => (
            <div key={i.name} className="flex items-center justify-between border rounded-md px-3 py-2">
              <span>{i.name}</span>
              <StatusBadge status={i.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CARD 10 — Últimos erros */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Últimos Erros</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {data.recentErrors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem erros recentes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Retry</TableHead>
                  <TableHead>Fallback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentErrors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{fmtDate(e.at)}</TableCell>
                    <TableCell className="text-xs">{e.module}</TableCell>
                    <TableCell className="text-xs">{e.provider ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{e.code ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-md truncate">{e.error ?? "—"}</TableCell>
                    <TableCell className="text-xs">{e.retries}</TableCell>
                    <TableCell className="text-xs">{e.fallback ? "Sim" : "Não"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* CARD 11 — Última prospecção */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Última Prospecção</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {!data.lastExecution ? (
            <p className="text-muted-foreground">Nenhuma execução registrada.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-3">
              <KV label="ID" value={data.lastExecution.id} />
              <KV label="Status" value={data.lastExecution.status ?? "—"} />
              <KV label="Provider" value={data.lastExecution.provider ?? "—"} />
              <KV label="Módulo" value={data.lastExecution.module ?? "—"} />
              <KV label="Início" value={fmtDate(data.lastExecution.started_at)} />
              <KV label="Fim" value={fmtDate(data.lastExecution.finished_at)} />
              <KV label="Duração" value={data.lastExecution.duration_ms ? `${data.lastExecution.duration_ms} ms` : "—"} />
              <KV label="Retries" value={String(data.lastExecution.retries ?? 0)} />
              <KV label="Fallback" value={data.lastExecution.fallback_used ? "Sim" : "Não"} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* CARD 12 — Estatísticas */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Estatísticas</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
          <KV label="Buscas (hoje)" value={String(data.stats.today ?? "—")} />
          <KV label="Buscas (semana)" value={String(data.stats.week ?? "—")} />
          <KV label="Buscas (mês)" value={String(data.stats.month ?? "—")} />
          <KV label="Tempo médio" value={data.stats.avgDurationMs ? `${data.stats.avgDurationMs} ms` : "—"} />
          <KV label="Fallbacks" value={String(data.stats.fallbacks ?? 0)} />
          <KV label="Retries" value={String(data.stats.retries ?? 0)} />
          <KV label="Leads" value={String(data.stats.leads ?? "—")} />
          <KV label="Produtos" value={String(data.stats.products ?? "—")} />
          <KV label="ICPs" value={String(data.stats.icps ?? "—")} />
        </CardContent>
      </Card>

      {/* CARD 13 — Self-check result */}
      {selfCheck && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resultado do Diagnóstico ({selfCheck.level.toUpperCase()})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {selfCheck.results.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between border rounded-md px-3 py-2">
                <div className="flex items-center gap-2">
                  {r.level === "ok" ? <CheckCircle2 className="size-4 text-green-600" /> :
                    r.level === "warn" ? <AlertTriangle className="size-4 text-yellow-600" /> :
                    <XCircle className="size-4 text-destructive" />}
                  <span className="font-medium">{r.name}</span>
                </div>
                <span className="text-muted-foreground">{r.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* CARD 14 — Checklist */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Checklist</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 text-sm">
          {data.checklist.map((c) => (
            <div key={c.item} className="flex items-center justify-between border rounded-md px-3 py-2">
              <span>{c.item}</span>
              {c.ok ? <CheckCircle2 className="size-4 text-green-600" /> : <XCircle className="size-4 text-destructive" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* CARD 15 — Export */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Exportar</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}><Download className="size-4 mr-1" /> JSON</Button>
          <Button variant="outline" size="sm" onClick={exportTxt}><Download className="size-4 mr-1" /> TXT</Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground pt-2">
        Gerado em {fmtDate(data.generatedAt)}. API keys e secrets nunca são exibidos.
      </p>
    </div>
  );
}

function KV({ label, value, copyable, onCopy }: { label: string; value: React.ReactNode; copyable?: boolean; onCopy?: (s: string) => void }) {
  return (
    <div className="flex items-center justify-between border rounded-md px-3 py-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-2 text-right">
        <span className="font-medium text-sm break-all">{value}</span>
        {copyable && typeof value === "string" && onCopy && (
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onCopy(value as string)}>
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "outline" | "secondary" | "destructive" }> = {
    connected: { label: "Conectado", variant: "default" },
    ok: { label: "OK", variant: "default" },
    error: { label: "Erro", variant: "destructive" },
    invalid: { label: "Inválida", variant: "destructive" },
    disabled: { label: "Desativada", variant: "outline" },
    not_connected: { label: "Não conectado", variant: "outline" },
    unknown: { label: "Desconhecido", variant: "secondary" },
  };
  const m = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

function Dot({ color }: { color: string }) {
  const cls =
    color === "green" ? "bg-green-500" : color === "yellow" ? "bg-yellow-500" : color === "red" ? "bg-red-500" : "bg-muted";
  return <span className={`inline-block size-2.5 rounded-full ${cls}`} />;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}