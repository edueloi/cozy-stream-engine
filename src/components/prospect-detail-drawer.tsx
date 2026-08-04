import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, HelpCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { listDecisionMakers, enrichSelected, findDecisionMakers, importResults } from "@/lib/prospecting.functions";
import { classifyPersistedScore } from "@/lib/icp/display-mapper";
import { toast } from "sonner";
import { ProspectPipelineSteps } from "./prospect-pipeline-steps";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  result: any | null;
  score: any | null; // linha de prospecting_company_scores (opcional)
  minimumScore?: number;
  isAdmin?: boolean;
  onImported?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleSelect?: () => void;
  isSelected?: boolean;
  positionLabel?: string;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("pt-BR"); } catch { return v; }
}

function Field({ label, value }: { label: string; value: any }) {
  const display = value == null || value === "" ? "—" : Array.isArray(value) ? value.join(", ") : String(value);
  return (
    <div className="grid grid-cols-3 gap-2 py-1 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2 break-words">{display}</div>
    </div>
  );
}

function StateBadge({ state }: { state: "matched" | "not_matched" | "unknown" | "disqualified" | "pending" }) {
  const cfg = {
    matched: { icon: CheckCircle2, className: "bg-emerald-500 text-white", label: "Atende" },
    not_matched: { icon: XCircle, className: "bg-slate-400 text-white", label: "Não atende" },
    unknown: { icon: HelpCircle, className: "bg-amber-400 text-white", label: "Desconhecido" },
    disqualified: { icon: AlertTriangle, className: "bg-red-500 text-white", label: "Desqualificador" },
    pending: { icon: Loader2, className: "bg-blue-400 text-white", label: "Aguardando" },
  }[state];
  const Icon = cfg.icon;
  return <Badge className={`gap-1 ${cfg.className}`}><Icon className="h-3 w-3" />{cfg.label}</Badge>;
}

export function ProspectDetailDrawer({
  open, onOpenChange, result, score, minimumScore = 80, isAdmin, onImported,
  onPrev, onNext, onToggleSelect, isSelected, positionLabel,
}: Props) {
  const listDMFn = useServerFn(listDecisionMakers);
  const enrichFn = useServerFn(enrichSelected);
  const findDMFn = useServerFn(findDecisionMakers);
  const importFn = useServerFn(importResults);

  const resultId = result?.id;
  const { data: dms } = useQuery({
    queryKey: ["prospect-dms", resultId],
    queryFn: () => listDMFn({ data: { resultId } }),
    enabled: !!resultId && open,
  });

  const label = useMemo(() => classifyPersistedScore(score, { minimumScore }), [score, minimumScore]);

  if (!result) return null;

  // Derivar buckets a partir das listas persistidas (matched/missing/disqualifying)
  // Nota: campo ausente é `unknown`, não `disqualified`.
  const matchedList: string[] = score?.matched_criteria ?? [];
  const missingList: string[] = score?.missing_criteria ?? [];
  const disqList: string[] = score?.disqualifying_reasons ?? [];
  // `missing` no persistido pode conter tanto not_matched quanto unknown; sem o
  // detalhe granular, exibimos como "Ainda desconhecidos" — nunca duplicando em desqualificadores.
  const uniqueMissing = missingList.filter((m) => !disqList.includes(m));

  const dataQuality = (() => {
    let s = 0;
    if (result.email) s += 35;
    if (result.phone) s += 30;
    if (result.website) s += 15;
    if (result.address) s += 10;
    if (result.cnpj) s += 10;
    return Math.min(100, s);
  })();

  async function handleImport() {
    try {
      const r = await importFn({ data: { ids: [resultId] } });
      const ins = (r as any).inserted ?? 0;
      const dup = ((r as any).duplicates ?? []).length;
      if (ins > 0) {
        toast.success("Empresa importada como lead.");
        onImported?.();
      } else if (dup > 0) {
        toast.info("Lead já existe na base — use a tabela para escolher atualizar ou ignorar.");
      } else {
        toast.warning("Nada importado.");
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao importar."); }
  }
  async function handleReEnrich() {
    try {
      await enrichFn({ data: { ids: [resultId], force: true } });
      toast.success("Re-enriquecimento iniciado.");
    } catch (e: any) { toast.error(e?.message ?? "Erro no enriquecimento."); }
  }
  async function handleFindDM() {
    try {
      const r = await findDMFn({ data: { resultId } });
      toast.info((r as any).note ?? "Busca de decisor solicitada.");
    } catch (e: any) { toast.error(e?.message ?? "Erro na busca de decisor."); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-hidden flex flex-col p-0">
        <SheetHeader className="p-6 pb-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-xl">{result.company_name || "Empresa sem nome"}</SheetTitle>
            {positionLabel && <span className="text-xs text-muted-foreground">{positionLabel}</span>}
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline">{result.cnpj || "sem CNPJ"}</Badge>
            <Badge variant="secondary">{result.city || "—"} / {result.state || "—"}</Badge>
            <Badge className={
              label === "Lead Bom" ? "bg-emerald-500 text-white" :
              label === "Lead Potencial" ? "bg-amber-500 text-white" :
              label === "Lead Frio" ? "bg-slate-400 text-white" :
              label === "Em processamento" ? "bg-blue-500 text-white" :
              "bg-slate-500 text-white"
            }>{label}</Badge>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <section className="mb-5">
            <h3 className="font-semibold mb-2">Dados da empresa</h3>
            <Field label="Razão social" value={result.company_name} />
            <Field label="CNPJ" value={result.cnpj} />
            <Field label="Situação" value={result.situacao_cadastral} />
            <Field label="CNAE" value={result.cnae} />
            <Field label="CNAEs secundários" value={result.cnaes_secundarios} />
            <Field label="Segmento" value={result.segment} />
            <Field label="Porte" value={result.porte} />
            <Field label="Cidade / UF" value={`${result.city ?? "—"} / ${result.state ?? "—"}`} />
            <Field label="Endereço" value={result.address} />
            <Field label="Site" value={result.website} />
            <Field label="Telefone" value={result.phone} />
            <Field label="E-mail" value={result.email} />
            <Field label="Capital social" value={result.capital_social} />
            <Field label="Funcionários" value={result.estimated_employees} />
            <Field label="Abertura" value={result.data_abertura} />
          </section>

          <Separator />

          <section className="my-5">
            <h3 className="font-semibold mb-2">Qualificação</h3>
            <div className="mb-3 rounded-md border p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Etapas do pipeline</div>
              <ProspectPipelineSteps row={result} score={score} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground text-xs">Score ICP</div>
                <div className="text-2xl font-semibold">
                  {score?.icp_score != null ? `${score.icp_score}%` : label === "Em processamento" ? "…" : "Dados insuficientes"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground text-xs">Qualidade dos dados</div>
                <div className="text-2xl font-semibold">{dataQuality}%</div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {matchedList.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1 flex items-center gap-2">Critérios atendidos <StateBadge state="matched" /></div>
                  <ul className="text-sm list-disc pl-5">{matchedList.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              {uniqueMissing.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1 flex items-center gap-2">Ainda desconhecidos <StateBadge state="unknown" /></div>
                  <ul className="text-sm list-disc pl-5">{uniqueMissing.map((m) => <li key={m}>{m}</li>)}</ul>
                  <div className="text-xs text-muted-foreground mt-1">Dados ausentes NÃO reprovam a empresa — o enriquecimento pode preencher.</div>
                </div>
              )}
              {disqList.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1 flex items-center gap-2">Desqualificadores reais <StateBadge state="disqualified" /></div>
                  <ul className="text-sm list-disc pl-5">{disqList.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              {matchedList.length === 0 && uniqueMissing.length === 0 && disqList.length === 0 && (
                <div className="text-sm text-muted-foreground">Qualificação aguardando enriquecimento.</div>
              )}
            </div>
            {(matchedList.length > 0 || uniqueMissing.length > 0 || disqList.length > 0) && (
              <div className="mt-4 rounded-md border p-3 bg-muted/30">
                <div className="text-xs font-semibold mb-2">Como o Score foi calculado</div>
                <ul className="text-xs font-mono space-y-0.5">
                  {matchedList.map((m) => (
                    <li key={`m-${m}`} className="text-emerald-700 dark:text-emerald-400">+ {m}</li>
                  ))}
                  {uniqueMissing.map((m) => (
                    <li key={`u-${m}`} className="text-muted-foreground">0 {m} (desconhecido — não penaliza)</li>
                  ))}
                  {disqList.map((m) => (
                    <li key={`d-${m}`} className="text-red-700 dark:text-red-400">− {m} (desqualificador)</li>
                  ))}
                  <li className="mt-1 pt-1 border-t font-semibold">
                    Total: {score?.icp_score ?? 0} pontos
                  </li>
                </ul>
                <div className="text-[11px] text-muted-foreground mt-2">
                  Dados desconhecidos não reduzem o score. Apenas desqualificadores reais rebaixam para "Fora do Perfil".
                </div>
              </div>
            )}
          </section>

          <Separator />

          <section className="my-5">
            <h3 className="font-semibold mb-2">Decisores</h3>
            {((dms as any)?.items ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum decisor encontrado ainda.</div>
            ) : (
              <div className="space-y-2">
                {((dms as any).items).map((d: any) => (
                  <div key={d.id} className="rounded-md border p-2 text-sm">
                    <div className="font-medium">{d.name} {d.role && <span className="text-muted-foreground">— {d.role}</span>}</div>
                    <div className="text-xs text-muted-foreground">{d.email ?? "—"} · {d.phone ?? "—"} · {d.linkedin ?? "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section className="my-5">
            <h3 className="font-semibold mb-2">Enriquecimento</h3>
            {isAdmin ? (
              <div className="text-sm space-y-1">
                <Field label="Status" value={result.enrichment_status} />
                <Field label="Fontes" value={result.enrichment_sources} />
                <Field label="Custo (cents)" value={result.enrichment_cost_cents} />
                <Field label="Enriquecido em" value={fmtDate(result.enriched_at)} />
                {result.enrichment_errors?.length > 0 && (
                  <div className="text-xs text-destructive">{result.enrichment_errors.join(" · ")}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Dados verificados pelo JCS Data Engine.</div>
            )}
          </section>
        </ScrollArea>

        <SheetFooter className="p-4 border-t gap-2 sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onPrev} disabled={!onPrev}>← Anterior</Button>
            <Button variant="outline" size="sm" onClick={onNext} disabled={!onNext}>Próximo →</Button>
            {onToggleSelect && (
              <Button variant={isSelected ? "default" : "outline"} size="sm" onClick={onToggleSelect}>
                {isSelected ? "Selecionado ✓" : "Selecionar"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleReEnrich}>Re-enriquecer</Button>
            <Button variant="outline" size="sm" onClick={handleFindDM}>Recarregar decisor</Button>
          </div>
          <Button onClick={handleImport}>Importar como Lead</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}