import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listIcps,
  upsertIcp,
  duplicateIcp,
  toggleIcpStatus,
  deleteIcp,
  getFeatureFlag,
  setFeatureFlag,
} from "@/lib/icp.functions";
import { DEFAULT_WEIGHTS } from "@/lib/icp-scorer";

export const Route = createFileRoute("/_authenticated/ideal-customer-profiles")({
  component: IcpPage,
});

const CRITERION_FIELDS: Array<{ key: string; label: string; type: "list" | "number" }> = [
  { key: "desired_cnaes", label: "CNAEs desejados (separados por vírgula)", type: "list" },
  { key: "forbidden_cnaes", label: "CNAEs proibidos", type: "list" },
  { key: "segments", label: "Segmentos", type: "list" },
  { key: "states", label: "UFs", type: "list" },
  { key: "cities", label: "Cidades", type: "list" },
  { key: "portes", label: "Portes (ME, EPP, MEDIO, GRANDE)", type: "list" },
  { key: "min_capital_social", label: "Capital social mínimo (R$)", type: "number" },
  { key: "min_faturamento", label: "Faturamento estimado mínimo (R$)", type: "number" },
  { key: "min_employees", label: "Funcionários mínimos", type: "number" },
  { key: "max_employees", label: "Funcionários máximos", type: "number" },
  { key: "situacao_cadastral", label: "Situação cadastral (ex: ATIVA)", type: "list" },
  { key: "min_company_age_years", label: "Idade mínima (anos)", type: "number" },
  { key: "desired_roles", label: "Cargos desejados", type: "list" },
  { key: "forbidden_roles", label: "Cargos proibidos", type: "list" },
];

function IcpPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.endsWith("/new")) return <Outlet />;
  return (
    <div className="w-full">
        <PageHeader
          title="Público Ideal (ICP)"
          description="Cadastre seu público ideal e defina critérios para qualificar prospects. Somente empresas com score ≥ mínimo aparecem como Lead Bom."
        />
        <FeatureFlagToggle />
        <IcpList />
    </div>
  );
}

function FeatureFlagToggle() {
  const fn = useServerFn(getFeatureFlag);
  const setFn = useServerFn(setFeatureFlag);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["icp-flag"], queryFn: () => fn() });
  const m = useMutation({
    mutationFn: (enabled: boolean) => setFn({ data: { enabled } }),
    onSuccess: () => {
      toast.success("Preferência salva");
      qc.invalidateQueries({ queryKey: ["icp-flag"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Card className="mb-4">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Smart Prospect Engine</div>
          <div className="text-xs text-muted-foreground">
            Habilita o botão "Classificar pelo ICP" na aba Prospecção. Não altera nenhum fluxo existente.
          </div>
        </div>
        <Switch checked={data?.enabled ?? false} onCheckedChange={(v) => m.mutate(!!v)} />
      </CardContent>
    </Card>
  );
}

function IcpList() {
  const fnList = useServerFn(listIcps);
  const fnDup = useServerFn(duplicateIcp);
  const fnToggle = useServerFn(toggleIcpStatus);
  const fnDel = useServerFn(deleteIcp);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["icps"], queryFn: () => fnList() });
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["icps"] });

  const dup = useMutation({
    mutationFn: (id: string) => fnDup({ data: { id } }),
    onSuccess: () => { toast.success("ICP duplicado"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const tog = useMutation({
    mutationFn: (v: { id: string; status: "active" | "inactive" }) => fnToggle({ data: v }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => fnDel({ data: { id } }),
    onSuccess: () => { toast.success("ICP excluído"); invalidate(); },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" asChild><Link to="/ideal-customer-profiles/new">Novo ICP</Link></Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Nenhum ICP cadastrado.</CardContent></Card>
      ) : (
        items.map((icp: any) => (
          <Card key={icp.id}>
            <CardContent className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{icp.name}</div>
                  <Badge variant={icp.status === "active" ? "default" : "outline"}>{icp.status}</Badge>
                  <Badge variant="secondary">Score mínimo: {icp.minimum_score}%</Badge>
                </div>
                {icp.description && <div className="text-xs text-muted-foreground mt-1">{icp.description}</div>}
                {icp.product_or_service && (
                  <div className="text-xs mt-1"><span className="text-muted-foreground">Produto/serviço:</span> {icp.product_or_service}</div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setEditing(icp)}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => dup.mutate(icp.id)}>Duplicar</Button>
                <Button size="sm" variant="ghost" onClick={() => tog.mutate({ id: icp.id, status: icp.status === "active" ? "inactive" : "active" })}>
                  {icp.status === "active" ? "Desativar" : "Ativar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir ICP?")) del.mutate(icp.id); }}>Excluir</Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {(creating || editing) && (
        <IcpEditor
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function IcpEditor({ initial, onClose, onSaved }: { initial: any | null; onClose: () => void; onSaved: () => void }) {
  const fn = useServerFn(upsertIcp);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [product, setProduct] = useState(initial?.product_or_service ?? "");
  const [minScore, setMinScore] = useState<number>(initial?.minimum_score ?? 80);
  const [criteria, setCriteria] = useState<Record<string, any>>(initial?.criteria_json ?? {});
  const [weights, setWeights] = useState<Record<string, number>>({ ...DEFAULT_WEIGHTS, ...(initial?.weights_json ?? {}) });
  const [required, setRequired] = useState<string[]>(initial?.criteria_json?.required_criteria ?? []);

  const save = useMutation({
    mutationFn: () => fn({
      data: {
        id: initial?.id,
        name,
        description: description || null,
        product_or_service: product || null,
        status: initial?.status ?? "active",
        criteria_json: { ...criteria, required_criteria: required },
        weights_json: weights,
        minimum_score: Number(minScore) || 80,
      },
    }),
    onSuccess: () => { toast.success("ICP salvo"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  function setField(key: string, type: "list" | "number", raw: string) {
    if (type === "list") {
      const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
      setCriteria((c) => ({ ...c, [key]: arr.length ? arr : undefined }));
    } else {
      const n = raw === "" ? null : Number(raw);
      setCriteria((c) => ({ ...c, [key]: n }));
    }
  }

  function fieldValue(key: string, type: "list" | "number") {
    const v = criteria[key];
    if (v == null) return "";
    return type === "list" ? (Array.isArray(v) ? v.join(", ") : "") : String(v);
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="dialog-workspace max-w-3xl">
        <DialogHeader className="dialog-workspace-header"><DialogTitle>{initial ? "Editar ICP" : "Novo ICP"}</DialogTitle></DialogHeader>
        <div className="dialog-scroll-area space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Score mínimo (%)</Label><Input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} /></div>
          </div>
          <div><Label>Descrição</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>Produto ou serviço a oferecer</Label><Input value={product} onChange={(e) => setProduct(e.target.value)} /></div>

          <div className="border-t border-border/70 pt-5">
            <div className="text-sm font-medium mb-2">Critérios e pesos</div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
              {CRITERION_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{f.label}</Label>
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={required.includes(f.key)}
                          onChange={(e) => setRequired((r) => e.target.checked ? [...r, f.key] : r.filter((x) => x !== f.key))}
                        />
                        obrigatório
                      </label>
                      {f.key in DEFAULT_WEIGHTS && (
                        <Input
                          className="h-6 w-14 text-xs"
                          type="number"
                          value={weights[f.key] ?? 0}
                          onChange={(e) => setWeights((w) => ({ ...w, [f.key]: Number(e.target.value) }))}
                        />
                      )}
                    </div>
                  </div>
                  <Input
                    value={fieldValue(f.key, f.type)}
                    onChange={(e) => setField(f.key, f.type, e.target.value)}
                    placeholder={f.type === "list" ? "valor1, valor2" : "número"}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="dialog-workspace-footer">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
