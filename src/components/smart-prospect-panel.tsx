import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { listSearches, listResults } from "@/lib/prospecting.functions";
import { listProducts } from "@/lib/products.functions";
import { listIcps } from "@/lib/icp.functions";
import { runSmartFlowBatchFn, validateSearchAgainstIcpFn } from "@/lib/jcs-data-engine/smart-flow.functions";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Painel "Prospecção Inteligente — Beta".
 * Só é montado quando as duas flags estão ON (o gating é feito pelo caller).
 * Não altera o fluxo legado: opera sobre buscas existentes, rodando o Smart
 * Flow em lote (Pré-Score → Enriquecimento condicional → Score Final → Decisores).
 */
export function SmartProspectPanel() {
  const qc = useQueryClient();
  const searchesFn = useServerFn(listSearches);
  const productsFn = useServerFn(listProducts);
  const icpsFn = useServerFn(listIcps);
  const runBatch = useServerFn(runSmartFlowBatchFn);
  const validateFn = useServerFn(validateSearchAgainstIcpFn);

  const { data: searches } = useQuery({ queryKey: ["prospecting-searches"], queryFn: () => searchesFn() });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn() });
  const { data: icps } = useQuery({ queryKey: ["icps"], queryFn: () => icpsFn() });

  const [searchId, setSearchId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [icpId, setIcpId] = useState<string>("");
  const [targetGood, setTargetGood] = useState<number>(1);
  const [maxCompanies, setMaxCompanies] = useState<number>(10);
  const [maxCredits, setMaxCredits] = useState<number>(100);
  const [assumedCost, setAssumedCost] = useState<number>(25);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [validation, setValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);

  const resultsFn = useServerFn(listResults);
  const { data: results } = useQuery({
    queryKey: ["smart-results", searchId],
    enabled: !!searchId,
    queryFn: () => resultsFn({ data: { searchId } }),
  });

  const items = (results as any)?.items ?? [];

  const selectedSearch = useMemo(() => {
    return ((searches as any)?.items ?? []).find((s: any) => s.id === searchId);
  }, [searches, searchId]);
  const productName = useMemo(() => {
    return ((products as any)?.items ?? []).find((p: any) => p.id === productId)?.nome ?? "—";
  }, [products, productId]);
  const icpName = useMemo(() => {
    return ((icps as any)?.items ?? []).find((i: any) => i.id === icpId)?.name
      ?? validation?.icp_name
      ?? "—";
  }, [icps, icpId, validation]);

  // Revalida sempre que muda busca/produto/icp
  useMemo(() => {
    setValidation(null);
    if (!searchId || (!productId && !icpId)) return;
    let cancelled = false;
    setValidating(true);
    validateFn({
      data: {
        product_id: productId || null,
        icp_id: icpId || null,
        filters: (selectedSearch?.params ?? {}) as any,
      },
    })
      .then((r) => { if (!cancelled) setValidation(r); })
      .catch((e) => { if (!cancelled) setValidation({ ok: false, reason: e?.message, compatible: false }); })
      .finally(() => { if (!cancelled) setValidating(false); });
    return () => { cancelled = true; };
  }, [searchId, productId, icpId, selectedSearch, validateFn]);

  const missingRequired = !searchId || !productId || !icpId || !targetGood || !maxCompanies || !maxCredits;
  const isIncompatible = !!validation && validation.ok !== false && validation.compatible === false;
  const canRun = !!searchId && !!productId && !!icpId && !!targetGood && !!maxCompanies && !!maxCredits
    && !isIncompatible && !runMut_isPending();
  function runMut_isPending() { return runMut?.isPending ?? false; }

  const tabs = useMemo(() => {
    const good: any[] = [];
    const review: any[] = [];
    const rejected: any[] = [];
    const processing: any[] = [];
    for (const r of items) {
      const st = r.preliminary_status as string | null;
      const flow = r.smart_flow_status as string | null;
      if (st === "promissor" || (r.final_score ?? 0) >= 80) good.push(r);
      else if (st === "potencial" || st === "frio") review.push(r);
      else if (st === "descartado" || flow === "descartado_pelo_icp") rejected.push(r);
      else processing.push(r);
    }
    return { good, review, rejected, processing, all: items };
  }, [items]);

  const runMut = useMutation({
    mutationFn: async () => {
      if (!searchId) throw new Error("Selecione uma busca.");
      if (!productId) throw new Error("Selecione um Produto.");
      if (!icpId) throw new Error("Selecione um ICP.");
      if (isIncompatible) throw new Error("Busca incompatível com o ICP selecionado.");
      const ids = items.slice(0, maxCompanies).map((r: any) => r.id);
      if (ids.length === 0) throw new Error("Sem resultados na busca.");
      setProgress({ done: 0, total: ids.length });
      const chunkSize = 25;
      let done = 0;
      let lastAgg: any = null;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const r = await runBatch({
          data: {
            prospecting_result_ids: chunk,
            prospecting_search_id: searchId,
            icp_id: icpId || null,
            product_id: productId || null,
            assumed_enrichment_cost_cents: assumedCost,
            target_good_leads: targetGood,
            max_companies_to_analyze: maxCompanies,
            max_intelligence_credits: maxCredits,
            preliminary_minimum_score: validation?.preliminary_minimum_score ?? 70,
            final_minimum_score: validation?.final_minimum_score ?? 80,
          },
        });
        lastAgg = (r as any)?.aggregate ?? lastAgg;
        done += chunk.length;
        setProgress({ done, total: ids.length });
        const good = tabs.good.length + ((r as any)?.per_result?.filter((x: any) => x.final_score >= 80).length ?? 0);
        if (good >= targetGood) break;
      }
      return lastAgg;
    },
    onSuccess: (agg) => {
      toast.success(agg ? "Prospecção Inteligente concluída." : "Concluído.");
      qc.invalidateQueries({ queryKey: ["smart-results", searchId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha na execução."),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Prospecção Inteligente <Badge variant="secondary">Beta</Badge>
          </CardTitle>
          <CardDescription>
            O JCS SDR analisa os dados básicos antes de consumir enriquecimento pago
            e consulta somente os provedores necessários. Revise os resultados antes de importar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Busca existente</Label>
            <Select value={searchId} onValueChange={setSearchId}>
              <SelectTrigger><SelectValue placeholder="Selecione uma busca" /></SelectTrigger>
              <SelectContent>
                {((searches as any)?.items ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.source ?? "busca"} — {new Date(s.created_at).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {((products as any)?.items ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>ICP</Label>
            <Select value={icpId} onValueChange={setIcpId}>
              <SelectTrigger><SelectValue placeholder="Opcional (usa o do produto)" /></SelectTrigger>
              <SelectContent>
                {((icps as any)?.items ?? []).map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Meta de Leads Bons</Label>
            <Input type="number" min={1} value={targetGood} onChange={(e) => setTargetGood(Number(e.target.value) || 10)} />
          </div>
          <div className="space-y-1">
            <Label>Máx. empresas analisadas</Label>
            <Input type="number" min={1} max={500} value={maxCompanies} onChange={(e) => setMaxCompanies(Number(e.target.value) || 50)} />
          </div>
          <div className="space-y-1">
            <Label>Custo simulado por enriquecimento (cents)</Label>
            <Input type="number" min={0} value={assumedCost} onChange={(e) => setAssumedCost(Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>Limite de créditos <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} value={maxCredits} onChange={(e) => setMaxCredits(Number(e.target.value) || 0)} />
          </div>
          <div className="md:col-span-2">
            <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/40">
              <div className="font-medium mb-1">Resumo da execução</div>
              <div><span className="text-muted-foreground">Produto:</span> {productName}</div>
              <div><span className="text-muted-foreground">ICP:</span> {icpName}</div>
              <div><span className="text-muted-foreground">Pré-Score mínimo:</span> {validation?.preliminary_minimum_score ?? "—"}%</div>
              <div><span className="text-muted-foreground">Score final:</span> {validation?.final_minimum_score ?? "—"}%</div>
              <div><span className="text-muted-foreground">Meta:</span> {targetGood} Lead(s) Bom(ns)</div>
              <div><span className="text-muted-foreground">Máximo de empresas:</span> {maxCompanies}</div>
              <div><span className="text-muted-foreground">Limite:</span> {maxCredits} créditos</div>
              <div className="pt-2 flex items-center gap-2">
                <span className="text-muted-foreground">Compatibilidade:</span>
                {validating && <Badge variant="outline">Validando…</Badge>}
                {!validating && validation?.ok === false && (
                  <Badge variant="secondary">Aguardando Produto/ICP</Badge>
                )}
                {!validating && validation?.compatible === true && (validation?.warnings?.length ?? 0) === 0 && (
                  <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3 w-3" />Compatível</Badge>
                )}
                {!validating && validation?.compatible === true && (validation?.warnings?.length ?? 0) > 0 && (
                  <Badge className="bg-amber-500 text-white gap-1"><AlertTriangle className="h-3 w-3" />Atenção</Badge>
                )}
                {!validating && isIncompatible && (
                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Incompatível</Badge>
                )}
              </div>
              {isIncompatible && (
                <div className="mt-2 space-y-1">
                  <div className="font-medium text-destructive">Esta busca é incompatível com o ICP selecionado.</div>
                  <ul className="list-disc pl-5">
                    {(validation.blockers ?? []).map((b: any, i: number) => (
                      <li key={i}>{b.message}</li>
                    ))}
                  </ul>
                  <div className="text-muted-foreground pt-1">
                    Ações: revise os filtros da busca, escolha outro ICP ou outro Produto.
                  </div>
                </div>
              )}
              {!isIncompatible && (validation?.warnings?.length ?? 0) > 0 && (
                <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                  {validation.warnings.slice(0, 4).map((w: any, i: number) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
              {missingRequired && !isIncompatible && (
                <div className="text-muted-foreground pt-2">
                  Preencha Produto, ICP, Meta, Máximo de empresas e Limite de créditos para iniciar.
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-2 flex items-center gap-2">
            <Button onClick={() => runMut.mutate()} disabled={!canRun}>
              {runMut.isPending ? "Processando…" : "Executar Prospecção Inteligente"}
            </Button>
            {progress && (
              <div className="flex-1">
                <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
                <div className="text-xs text-muted-foreground mt-1">
                  {progress.done}/{progress.total} processadas
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados</CardTitle>
            <CardDescription>
              Bons: {tabs.good.length} · Revisão: {tabs.review.length} ·
              Rejeitados: {tabs.rejected.length} · Em processamento: {tabs.processing.length}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="good">
              <TabsList>
                <TabsTrigger value="good">Leads Bons ({tabs.good.length})</TabsTrigger>
                <TabsTrigger value="review">Em revisão ({tabs.review.length})</TabsTrigger>
                <TabsTrigger value="rejected">Rejeitados ({tabs.rejected.length})</TabsTrigger>
                <TabsTrigger value="processing">Em processamento ({tabs.processing.length})</TabsTrigger>
                <TabsTrigger value="all">Todos ({tabs.all.length})</TabsTrigger>
              </TabsList>
              {(["good", "review", "rejected", "processing", "all"] as const).map((k) => (
                <TabsContent key={k} value={k} className="mt-3">
                  <ResultsTable rows={(tabs as any)[k]} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultsTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="text-sm text-muted-foreground">Nenhum registro.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2">Empresa</th>
            <th>Cidade/UF</th>
            <th>Pré-Score</th>
            <th>Score Final</th>
            <th>Status</th>
            <th>Decisor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="py-2">{r.razao_social ?? r.nome_fantasia ?? "—"}</td>
              <td>{[r.cidade, r.uf ?? r.estado].filter(Boolean).join("/")}</td>
              <td>{r.preliminary_score ?? "—"}</td>
              <td>{r.final_score ?? r.icp_score ?? "—"}</td>
              <td>
                <Badge variant="outline">{r.smart_flow_status ?? r.preliminary_status ?? "—"}</Badge>
              </td>
              <td>{r.decision_makers_status ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}