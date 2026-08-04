import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, ChevronsUpDown, AlertTriangle, Sparkles, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CNAE_LIST, type CnaeOption } from "@/lib/cnae-list";
import { listProducts, upsertProduct, filterActiveProducts } from "@/lib/products.functions";
import { listIcps } from "@/lib/icp.functions";
import { createSearch, listResults } from "@/lib/prospecting.functions";
import { runSmartFlowBatchFn, validateSearchAgainstIcpFn } from "@/lib/jcs-data-engine/smart-flow.functions";

const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

/**
 * Formulário unificado de prospecção — sem menção a "fonte" ou provedor.
 * O JCS Data Engine decide a discovery (Casa dos Dados por padrão) e o
 * Smart Flow decide o enriquecimento. Vendedor escolhe Produto + ICP +
 * filtros comerciais + meta.
 *
 * Requisitos ativos:
 *   jcs_data_engine_enabled = true
 *   smart_flow_ui_enabled   = true
 * (gating feito pelo caller).
 */
interface SimplifiedNewProspectionProps {
  /**
   * Release 1.3.9 — quando a busca conclui, o formulário emite o searchId
   * para o container mostrar os resultados na mesma tela (sem navegar para
   * Histórico). Se não vier, mantém comportamento legado.
   */
  onSearchComplete?: (searchId: string, ctx: { icpId: string; minimumScore: number }) => void;
  /** true = form recolhido em modo resumido (após uma busca concluída). */
  collapsed?: boolean;
  onEditRequested?: () => void;
}

export function SimplifiedNewProspection({ onSearchComplete, collapsed, onEditRequested }: SimplifiedNewProspectionProps = {}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const productsFn = useServerFn(listProducts);
  const icpsFn = useServerFn(listIcps);
  const upsertProductFn = useServerFn(upsertProduct);
  const createSearchFn = useServerFn(createSearch);
  const listResultsFn = useServerFn(listResults);
  const runSmartFlow = useServerFn(runSmartFlowBatchFn);
  const validateFn = useServerFn(validateSearchAgainstIcpFn);

  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => productsFn() });
  const { data: icps } = useQuery({ queryKey: ["icps"], queryFn: () => icpsFn() });
  const activeProducts = useMemo(
    () => filterActiveProducts(((products as any)?.items ?? []) as Array<{ status?: string }>),
    [products],
  );

  // Quick-create product dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIcp, setNewIcp] = useState<string>("");
  const createProduct = useMutation({
    mutationFn: async () => {
      const row = await upsertProductFn({
        data: {
          nome: newName.trim(),
          descricao: newDesc.trim() || null,
          icp_id: newIcp || null,
          produto_padrao: false,
          status: "active",
          ordem: 0,
        },
      });
      return row as any;
    },
    onSuccess: async (row: any) => {
      await qc.invalidateQueries({ queryKey: ["products"] });
      setProductId(row?.id ?? "");
      if (row?.icp_id) setIcpId(row.icp_id);
      setCreateOpen(false);
      setNewName(""); setNewDesc(""); setNewIcp("");
      toast.success("Produto criado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar produto"),
  });

  // Seleção comercial
  const [productId, setProductId] = useState<string>("");
  const [icpId, setIcpId] = useState<string>("");
  const [segmento, setSegmento] = useState<string>("");
  const [cnae, setCnae] = useState<CnaeOption | null>(null);
  const [cnaeOpen, setCnaeOpen] = useState(false);
  const [uf, setUf] = useState<string>("");
  const [cidade, setCidade] = useState<string>("");
  const [porte, setPorte] = useState<string>("");

  // Metas / limites
  const [targetGood, setTargetGood] = useState<number>(5);
  const [maxCompanies, setMaxCompanies] = useState<number>(50);
  const [maxCredits, setMaxCredits] = useState<number>(200);

  // Auto-preenche ICP com o do produto quando o usuário troca de produto.
  useEffect(() => {
    if (!productId) return;
    const p = ((products as any)?.items ?? []).find((x: any) => x.id === productId);
    if (p?.icp_id) setIcpId(p.icp_id);
  }, [productId, products]);

  // Filtros que serão enviados como "params" da busca — sempre mapeados para
  // o formato do discovery padrão (Casa dos Dados). O Smart Flow também usa
  // esses filtros para validar compatibilidade com o ICP.
  const filters = useMemo(() => ({
    cnae_principal: cnae?.code ?? "",
    uf: uf.trim(),
    cidade: cidade.trim(),
    porte: porte || undefined,
    situacao_cadastral: "ATIVA",
    limite: maxCompanies,
    segmento: segmento.trim() || undefined,
  }), [cnae, uf, cidade, porte, maxCompanies, segmento]);

  // Validação Produto+ICP × filtros (não chama nenhuma API externa).
  const [validation, setValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  useEffect(() => {
    setValidation(null);
    if (!productId && !icpId) return;
    let cancelled = false;
    setValidating(true);
    validateFn({ data: { product_id: productId || null, icp_id: icpId || null, filters } })
      .then((r) => { if (!cancelled) setValidation(r); })
      .catch((e) => { if (!cancelled) setValidation({ ok: false, reason: e?.message, compatible: false }); })
      .finally(() => { if (!cancelled) setValidating(false); });
    return () => { cancelled = true; };
  }, [productId, icpId, filters, validateFn]);

  const isIncompatible = !!validation && validation.ok !== false && validation.compatible === false;
  const missingRequired = !productId || !icpId || !targetGood || !maxCompanies || !maxCredits;

  // Cidades por UF (IBGE) — mesma fonte já usada em Casa dos Dados.
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    if (!uf) { setCities([]); return; }
    let alive = true;
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then((r) => r.json())
      .then((j) => { if (alive) setCities(Array.isArray(j) ? j.map((m: any) => m.nome).sort() : []); })
      .catch(() => alive && setCities([]));
    return () => { alive = false; };
  }, [uf]);

  const [progress, setProgress] = useState<{ phase: string; done: number; total: number } | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Selecione um Produto.");
      if (!icpId) throw new Error("Selecione um ICP.");
      if (isIncompatible) throw new Error("Filtros incompatíveis com o ICP selecionado.");

      setProgress({ phase: "Buscando empresas…", done: 0, total: 100 });

      // 1) Discovery padrão — Casa dos Dados. Vendedor nunca vê o nome da fonte.
      //    Não chamamos Apify/LinkedIn/Instagram diretamente pela UI.
      const search = await createSearchFn({
        data: { source: "casa_dos_dados", params: filters as any },
      });
      const searchId = (search as any).id as string;

      // 2) Lê os resultados coletados.
      setProgress({ phase: "Analisando resultados…", done: 30, total: 100 });
      const r = await listResultsFn({ data: { searchId } });
      const ids = ((r as any)?.items ?? []).slice(0, maxCompanies).map((x: any) => x.id);
      if (ids.length === 0) {
        setProgress(null);
        toast.info("Nenhuma empresa encontrada com esses filtros. Ajuste UF/CNAE e tente novamente.");
        return { searchId };
      }

      // 3) Smart Flow em lote — o motor decide os providers de enriquecimento.
      setProgress({ phase: "Rodando Prospecção Inteligente…", done: 60, total: 100 });
      const chunkSize = 25;
      let good = 0;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const out = await runSmartFlow({
          data: {
            prospecting_result_ids: chunk,
            prospecting_search_id: searchId,
            product_id: productId,
            icp_id: icpId,
            target_good_leads: targetGood,
            max_companies_to_analyze: maxCompanies,
            max_intelligence_credits: maxCredits,
            preliminary_minimum_score: validation?.preliminary_minimum_score ?? 70,
            final_minimum_score: validation?.final_minimum_score ?? 80,
          },
        });
        const per = (out as any)?.per_result ?? [];
        good += per.filter((x: any) => (x.final_score ?? 0) >= (validation?.final_minimum_score ?? 80)).length;
        setProgress({ phase: "Rodando Prospecção Inteligente…", done: 60 + Math.round(((i + chunk.length) / ids.length) * 40), total: 100 });
        if (good >= targetGood) break;
      }
      setProgress({ phase: "Concluído", done: 100, total: 100 });
      return { searchId };
    },
    onSuccess: (r: any) => {
      toast.success("Prospecção concluída.");
      const searchId = r?.searchId;
      if (searchId && onSearchComplete) {
        // Release 1.3.9 — mantém resultados na mesma tela.
        onSearchComplete(searchId, {
          icpId,
          minimumScore: validation?.final_minimum_score ?? 80,
        });
      } else if (searchId) {
        // Fallback legado.
        navigate({ to: "/prospecting", search: { openSearch: searchId } as any });
      }
    },
    onError: (e: any) => {
      setProgress(null);
      toast.error(e?.message ?? "Falha ao iniciar prospecção.");
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Nova Prospecção
          </CardTitle>
          <CardDescription>
            Escolha Produto e ICP, defina a região e a meta de leads bons. O sistema
            cuida do resto: descobre as empresas, avalia contra o ICP e enriquece
            apenas quem passa no pré-score.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Produto <span className="text-destructive">*</span></Label>
            <Select
              value={productId}
              onValueChange={(v) => {
                if (v === "__create__") { setCreateOpen(true); return; }
                setProductId(v);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
              <SelectContent>
                {activeProducts.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
                <SelectItem value="__create__">
                  <span className="inline-flex items-center gap-2"><Plus className="h-3 w-3" />Criar novo produto</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>ICP <span className="text-destructive">*</span></Label>
            <Select value={icpId} onValueChange={setIcpId}>
              <SelectTrigger><SelectValue placeholder="Auto do produto ou selecione" /></SelectTrigger>
              <SelectContent>
                {((icps as any)?.items ?? []).map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Segmento</Label>
            <Input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="ex.: contabilidade, transportadora" />
          </div>
          <div className="space-y-1">
            <Label>CNAE</Label>
            <Popover open={cnaeOpen} onOpenChange={setCnaeOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {cnae ? `${cnae.code} · ${cnae.label}` : "Selecionar CNAE (opcional)"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command filter={(v, s) => v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0}>
                  <CommandInput placeholder="Buscar CNAE..." />
                  <CommandList>
                    <CommandEmpty>Nenhum CNAE encontrado.</CommandEmpty>
                    <CommandGroup>
                      {CNAE_LIST.map((c) => (
                        <CommandItem key={c.code} value={`${c.code} ${c.label}`} onSelect={() => { setCnae(c); setCnaeOpen(false); }}>
                          <CheckIcon selected={cnae?.code === c.code} />
                          <span className="font-mono text-xs mr-2">{c.code}</span>
                          <span>{c.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>UF</Label>
            <Select value={uf || "__all__"} onValueChange={(v) => setUf(v === "__all__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {UF_LIST.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Cidade</Label>
            <Input
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              disabled={!uf}
              placeholder={uf ? "Digite a cidade" : "Selecione a UF primeiro"}
              list="simplified-cities"
            />
            <datalist id="simplified-cities">
              {cities.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label>Porte</Label>
            <Select value={porte || "__any__"} onValueChange={(v) => setPorte(v === "__any__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Qualquer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Qualquer</SelectItem>
                <SelectItem value="ME">ME (Microempresa)</SelectItem>
                <SelectItem value="EPP">EPP (Pequeno porte)</SelectItem>
                <SelectItem value="DEMAIS">Demais (Médio/Grande)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Meta de Leads Bons <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} value={targetGood} onChange={(e) => setTargetGood(Number(e.target.value) || 1)} />
          </div>
          <div className="space-y-1">
            <Label>Máx. empresas a analisar <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} max={500} value={maxCompanies} onChange={(e) => setMaxCompanies(Number(e.target.value) || 10)} />
          </div>
          <div className="space-y-1">
            <Label>Limite de créditos <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} value={maxCredits} onChange={(e) => setMaxCredits(Number(e.target.value) || 0)} />
          </div>

          <div className="md:col-span-2 rounded-md border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Compatibilidade com o ICP:</span>
              {validating && <Badge variant="outline">Validando…</Badge>}
              {!validating && (!productId || !icpId) && <Badge variant="secondary">Selecione Produto e ICP</Badge>}
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
              <div className="text-destructive">
                <div>Os filtros escolhidos não batem com o ICP:</div>
                <ul className="list-disc pl-5">
                  {(validation.blockers ?? []).map((b: any, i: number) => <li key={i}>{b.message}</li>)}
                </ul>
              </div>
            )}
            {!isIncompatible && (validation?.warnings?.length ?? 0) > 0 && (
              <ul className="list-disc pl-5 text-muted-foreground">
                {validation.warnings.slice(0, 4).map((w: any, i: number) => <li key={i}>{w.message}</li>)}
              </ul>
            )}
          </div>

          <div className="md:col-span-2 flex items-center gap-3">
            <Button
              onClick={() => run.mutate()}
              disabled={run.isPending || missingRequired || isIncompatible}
            >
              {run.isPending ? "Processando…" : "Iniciar Prospecção"}
            </Button>
            {progress && (
              <div className="flex-1">
                <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
                <div className="text-xs text-muted-foreground mt-1">{progress.phase}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex.: Consultoria em nuvem" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            </div>
            <div>
              <Label>ICP vinculado (opcional)</Label>
              <Select value={newIcp || "none"} onValueChange={(v) => setNewIcp(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="— sem ICP —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— sem ICP —</SelectItem>
                  {((icps as any)?.items ?? []).map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button disabled={!newName.trim() || createProduct.isPending} onClick={() => createProduct.mutate()}>
              {createProduct.isPending ? "Criando…" : "Criar e selecionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckIcon({ selected }: { selected: boolean }) {
  return (
    <span className={cn("mr-2 inline-block h-4 w-4 rounded border", selected ? "bg-primary border-primary" : "opacity-30")} />
  );
}