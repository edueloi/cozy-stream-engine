import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { listResults, importResults } from "@/lib/prospecting.functions";
import { listScoresForSearch } from "@/lib/icp.functions";
import { classifyPersistedScore, type IcpDisplayView } from "@/lib/icp/display-mapper";
import { ProspectDetailDrawer } from "./prospect-detail-drawer";
import { StartCadenceDialog } from "./start-cadence-dialog";
import { listUsers } from "@/lib/users.functions";

interface Props {
  searchId: string;
  icpId?: string | null;
  minimumScore?: number;
  isAdmin?: boolean;
  onImported?: () => void;
}

type Bucket = "Lead Bom" | "Lead Potencial" | "Lead Frio" | "Em processamento" | "Fora do perfil" | "Todos";

export function ProspectingResultsPanel({ searchId, icpId, minimumScore = 80, isAdmin, onImported }: Props) {
  const listResultsFn = useServerFn(listResults);
  const listScoresFn = useServerFn(listScoresForSearch);
  const importFn = useServerFn(importResults);
  const listUsersFn = useServerFn(listUsers);

  const { data: resultsData, isLoading, refetch } = useQuery({
    queryKey: ["prospecting-results", searchId],
    queryFn: () => listResultsFn({ data: { searchId } }),
    enabled: !!searchId,
  });
  const results: any[] = (resultsData as any)?.items ?? [];
  const resultIds = useMemo(() => results.map((r) => r.id), [results]);

  const { data: scoresData, refetch: refetchScores } = useQuery({
    queryKey: ["prospecting-scores", searchId, icpId, resultIds.length],
    queryFn: () => listScoresFn({ data: { icpId: icpId!, resultIds } }),
    enabled: !!icpId && resultIds.length > 0,
  });
  const scoresById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of ((scoresData as any)?.items ?? [])) m.set(s.prospecting_result_id, s);
    return m;
  }, [scoresData]);

  const bucketed = useMemo(() => {
    const map: Record<Bucket, any[]> = {
      "Lead Bom": [], "Lead Potencial": [], "Lead Frio": [], "Em processamento": [], "Fora do perfil": [], "Todos": [],
    };
    for (const r of results) {
      map["Todos"].push(r);
      const label = classifyPersistedScore(scoresById.get(r.id), { minimumScore }) as IcpDisplayView["summary_label"];
      if (label === "Lead Bom") map["Lead Bom"].push(r);
      else if (label === "Lead Potencial") map["Lead Potencial"].push(r);
      else if (label === "Lead Frio" || label === "Dados insuficientes") map["Lead Frio"].push(r);
      else if (label === "Em processamento") map["Em processamento"].push(r);
      else map["Fora do perfil"].push(r);
    }
    return map;
  }, [results, scoresById, minimumScore]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Bucket>("Lead Bom");
  const [ownerId, setOwnerId] = useState<string>("me");
  const [importedLeadIds, setImportedLeadIds] = useState<string[]>([]);
  const [cadenceOpen, setCadenceOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<
    { pendingIds: string[]; items: Array<{ result_id: string; existing_lead_id: string; match_by: string; company: string }> } | null
  >(null);

  const { data: usersData } = useQuery({
    queryKey: ["users-for-assign"],
    queryFn: () => listUsersFn(),
    enabled: !!isAdmin,
  });
  const users: any[] = (usersData as any) ?? [];

  // Auto-select tab: Lead Bom > Em revisão
  useEffect(() => {
    if (bucketed["Lead Bom"].length > 0) setActiveTab("Lead Bom");
    else if (bucketed["Lead Potencial"].length > 0) setActiveTab("Lead Potencial");
    else if (bucketed["Lead Frio"].length > 0) setActiveTab("Lead Frio");
  }, [bucketed["Lead Bom"].length, bucketed["Lead Potencial"].length, bucketed["Lead Frio"].length]);

  // Auto-scroll into view when results arrive
  useEffect(() => {
    if (!isLoading && results.length > 0) {
      const el = document.getElementById("prospecting-results");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isLoading, results.length]);

  function toggle(id: string) {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  async function doImport(ids: string[], opts: { onDuplicate?: "ask" | "update" | "ignore" } = {}) {
    if (ids.length === 0) { toast.info("Nenhuma empresa para importar."); return; }
    try {
      const r = await importFn({
        data: {
          ids,
          onDuplicate: opts.onDuplicate ?? "ask",
          ownerId: ownerId === "me" ? null : ownerId,
        },
      });
      const ins = (r as any).inserted ?? 0;
      const upd = (r as any).updated ?? 0;
      const skp = (r as any).skipped ?? 0;
      const fail = (r as any).failed ?? 0;
      const dups = ((r as any).duplicates ?? []) as any[];
      const leadIds = ((r as any).leadIds ?? []) as string[];

      if (dups.length > 0 && (!opts.onDuplicate || opts.onDuplicate === "ask")) {
        setDuplicates({ pendingIds: ids, items: dups });
        if (ins > 0) toast.success(`${ins} novos importados. ${dups.length} duplicatas aguardando decisão.`);
        return;
      }
      if (ins + upd > 0) {
        toast.success(
          `${ins} novos · ${upd} atualizados${skp ? ` · ${skp} ignorados` : ""}${fail ? ` · ${fail} falhas` : ""}.`,
        );
        setImportedLeadIds(leadIds);
        setCadenceOpen(leadIds.length > 0);
      } else if (skp > 0) {
        toast.info(`${skp} duplicatas ignoradas.`);
      } else {
        toast.warning("Nada importado.");
      }
      setSelected(new Set());
      onImported?.();
      refetch();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao importar."); }
  }

  const drawerRow = drawerId ? results.find((r) => r.id === drawerId) : null;
  const drawerScore = drawerId ? scoresById.get(drawerId) : null;
  const currentList = bucketed[activeTab];
  const drawerIndex = drawerId ? currentList.findIndex((r) => r.id === drawerId) : -1;
  const drawerPrev = drawerIndex > 0 ? currentList[drawerIndex - 1].id : null;
  const drawerNext = drawerIndex >= 0 && drawerIndex < currentList.length - 1 ? currentList[drawerIndex + 1].id : null;

  // Summary card
  const summary = useMemo(() => ({
    total: results.length,
    good: bucketed["Lead Bom"].length,
    potential: bucketed["Lead Potencial"].length,
    cold: bucketed["Lead Frio"].length,
    processing: bucketed["Em processamento"].length,
    out: bucketed["Fora do perfil"].length,
  }), [results.length, bucketed]);

  // RC2 — Auto-refresh enquanto houver empresas em processamento.
  // Sem isso, a tela ficava travada em "Em processamento" até F5.
  // RC2.1 — cap de 5 minutos (100 x 3s). Ao atingir estado terminal em
  // todas as empresas, encerra o polling automaticamente.
  useEffect(() => {
    if (summary.processing === 0) return;
    let ticks = 0;
    const t = setInterval(() => {
      ticks++;
      refetch();
      refetchScores();
      if (ticks >= 100) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
  }, [summary.processing, refetch, refetchScores]);

  return (
    <Card className="mt-6" id="prospecting-results">
      <CardHeader>
        <CardTitle>Resultados da Prospecção</CardTitle>
        <CardDescription>
          Empresas encontradas nesta busca. Clique em uma linha para ver todos os dados antes de importar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <SummaryStat label="Analisadas" value={summary.total} />
          <SummaryStat label="Leads Bons" value={summary.good} tone="emerald" />
          <SummaryStat label="Potenciais" value={summary.potential} tone="amber" />
          <SummaryStat label="Frios" value={summary.cold} tone="slate" />
          <SummaryStat label="Processando" value={summary.processing} tone="blue" />
          <SummaryStat label="Fora do perfil" value={summary.out} tone="slate" />
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-xs">Atribuir a:</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Eu (usuário atual)</SelectItem>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Bucket)}>
          <TabsList>
            {(["Lead Bom", "Lead Potencial", "Lead Frio", "Em processamento", "Fora do perfil", "Todos"] as Bucket[]).map((b) => (
              <TabsTrigger key={b} value={b}>
                {b} <Badge variant="secondary" className="ml-2">{bucketed[b].length}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {(Object.keys(bucketed) as Bucket[]).map((b) => (
            <TabsContent key={b} value={b} className="mt-3">
              <div className="flex items-center gap-2 mb-2">
                <Button size="sm" onClick={() => doImport(bucketed["Lead Bom"].map((r) => r.id))} disabled={bucketed["Lead Bom"].length === 0}>
                  Importar Leads Bons ({bucketed["Lead Bom"].length})
                </Button>
                <Button size="sm" variant="outline" onClick={() => doImport([...selected])} disabled={selected.size === 0}>
                  Importar selecionados ({selected.size})
                </Button>
                <Button size="sm" variant="ghost" onClick={() => doImport([...bucketed["Lead Bom"], ...bucketed["Lead Potencial"]].map((r) => r.id))}>
                  Importar Bons + Potenciais
                </Button>
              </div>
              <div className="border rounded-md overflow-x-auto">
                {isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                ) : bucketed[b].length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">Nenhuma empresa nesta aba.</div>
                ) : (
                  <table className="text-sm w-full">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2 w-8"></th>
                        <th className="text-left px-3 py-2">Empresa</th>
                        <th className="text-left px-3 py-2">Cidade/UF</th>
                        <th className="text-left px-3 py-2">Score</th>
                        <th className="text-left px-3 py-2">Status</th>
                        <th className="text-right px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucketed[b].map((r) => {
                        const s = scoresById.get(r.id);
                        const label = classifyPersistedScore(s, { minimumScore });
                        return (
                          <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setDrawerId(r.id)}>
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{r.company_name || "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono">{r.cnpj || "sem CNPJ"}</div>
                            </td>
                            <td className="px-3 py-2">{r.city || "—"} / {r.state || "—"}</td>
                            <td className="px-3 py-2">
                              {s?.icp_score != null ? `${s.icp_score}%` : label === "Em processamento" ? "…" : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <Badge className={
                                label === "Lead Bom" ? "bg-emerald-500 text-white" :
                                label === "Lead Potencial" ? "bg-amber-500 text-white" :
                                label === "Lead Frio" ? "bg-slate-400 text-white" :
                                label === "Em processamento" ? "bg-blue-500 text-white" :
                                "bg-slate-500 text-white"
                              }>{label}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" onClick={() => setDrawerId(r.id)}>Ver detalhes</Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      <ProspectDetailDrawer
        open={!!drawerId}
        onOpenChange={(v) => !v && setDrawerId(null)}
        result={drawerRow}
        score={drawerScore}
        minimumScore={minimumScore}
        isAdmin={isAdmin}
        onImported={() => { refetch(); onImported?.(); }}
        onPrev={drawerPrev ? () => setDrawerId(drawerPrev) : undefined}
        onNext={drawerNext ? () => setDrawerId(drawerNext) : undefined}
        onToggleSelect={drawerId ? () => toggle(drawerId) : undefined}
        isSelected={drawerId ? selected.has(drawerId) : false}
        positionLabel={drawerIndex >= 0 ? `${drawerIndex + 1} / ${currentList.length}` : undefined}
      />

      {/* Duplicate resolution dialog */}
      <Dialog open={!!duplicates} onOpenChange={(v) => !v && setDuplicates(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Duplicatas detectadas</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2 max-h-64 overflow-auto">
            {(duplicates?.items ?? []).map((d) => (
              <div key={d.result_id} className="flex items-center justify-between border rounded p-2">
                <div><div className="font-medium">{d.company}</div><div className="text-xs text-muted-foreground">match: {d.match_by}</div></div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={async () => {
              const ids = (duplicates?.items ?? []).map((d) => d.result_id);
              setDuplicates(null);
              await doImport(ids, { onDuplicate: "ignore" });
            }}>Ignorar todos</Button>
            <Button onClick={async () => {
              const ids = (duplicates?.items ?? []).map((d) => d.result_id);
              setDuplicates(null);
              await doImport(ids, { onDuplicate: "update" });
            }}>Atualizar todos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cadence prompt after successful import */}
      {cadenceOpen && importedLeadIds.length > 0 && (
        <div className="mt-4 rounded-md border bg-emerald-50 dark:bg-emerald-950/20 p-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <strong>{importedLeadIds.length} lead(s) importado(s).</strong> Deseja iniciar uma cadência agora?
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setCadenceOpen(false); setImportedLeadIds([]); }}>Depois</Button>
            <StartCadenceDialog
              leadIds={importedLeadIds}
              trigger={<Button size="sm">Escolher cadência</Button>}
              onDone={() => { setCadenceOpen(false); setImportedLeadIds([]); }}
            />
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "amber" | "blue" | "slate" }) {
  const cls = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "blue" ? "text-blue-600" : tone === "slate" ? "text-slate-600" : "";
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}