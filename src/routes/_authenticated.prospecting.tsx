import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { CNAE_LIST, type CnaeOption } from "@/lib/cnae-list";
import { cn } from "@/lib/utils";
import {
  listSources,
  listSearches,
  listResults,
  createSearch,
  importResults,
  enrichResult,
  getProspectingDashboard,
  findDecisionMakers,
  listDecisionMakers,
  enrichSelected,
} from "@/lib/prospecting.functions";
import {
  listProviders,
  saveProviderCredential,
  deleteProviderCredential,
  testProviderConnection,
  setProviderEnabled,
} from "@/lib/providers/providers.functions";
import type { ProviderMeta } from "@/lib/providers/catalog";
import { listIcps, scoreResults, listScoresForSearch, getFeatureFlag } from "@/lib/icp.functions";
import { listProducts, getUniversalIcpFlag } from "@/lib/products.functions";
import { getSmartFlowFlags } from "@/lib/jcs-data-engine/flags.functions";
import { getProspectingDiagnostics } from "@/lib/jcs-data-engine/flags.functions";
import { SmartProspectPanel } from "@/components/smart-prospect-panel";
import { SimplifiedNewProspection } from "@/components/simplified-new-prospection";
import { ProspectingResultsPanel } from "@/components/prospecting-results-panel";
import { getMyRoles } from "@/lib/users.functions";
import { classifyUniversal } from "@/lib/icp/universal-icp.functions";
import { ratingFromScore, type IcpRating, type UniversalIcpScore, type ClassificationSummary } from "@/lib/icp/universal-icp-engine";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/prospecting")({
  component: ProspectingPage,
});

function ProspectingPage() {
  const flagsFn = useServerFn(getSmartFlowFlags);
  const { data: flags } = useQuery({ queryKey: ["smart-flow-flags"], queryFn: () => flagsFn() });
  const rolesFn = useServerFn(getMyRoles);
  const { data: rolesData } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const roles = ((rolesData as any)?.roles ?? []) as string[];
  const isAdmin = roles.includes("superadmin") || roles.includes("admin");
  const isSuperadmin = roles.includes("superadmin");
  const smartAvailable = Boolean((flags as any)?.smart_flow_available);
  const navigate = useNavigate();

  // SuperAdmin OU flags ON → mostra experiência completa.
  // SuperAdmin sempre vê Smart Flow (Beta) e Diagnóstico, mesmo com flags OFF.
  if (smartAvailable || isSuperadmin) {
    return (
      <div className="w-full">
        <PageHeader
          title="Prospecção"
          description="Escolha Produto e ICP — o motor cuida das fontes e do enriquecimento."
        />
        <DashboardKpis />
        <Tabs defaultValue="new" className="mt-6">
          <TabsList>
            <TabsTrigger value="new">Nova Prospecção</TabsTrigger>
            {(smartAvailable || isSuperadmin) && (
              <TabsTrigger value="smart">Prospecção Inteligente (Beta)</TabsTrigger>
            )}
            <TabsTrigger value="import">Importar Base</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            {isAdmin && <TabsTrigger value="integrations">Integrações</TabsTrigger>}
            {isSuperadmin && <TabsTrigger value="diagnostics">Diagnóstico</TabsTrigger>}
          </TabsList>
          <TabsContent value="new" className="mt-4">
            <NewProspectionWithResults isAdmin={isAdmin} />
          </TabsContent>
          {(smartAvailable || isSuperadmin) && (
            <TabsContent value="smart" className="mt-4">
              {!smartAvailable && isSuperadmin && (
                <Card className="mb-4 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                  <CardContent className="p-4 text-sm">
                    <strong>Aviso (visível apenas para SuperAdmin):</strong> as flags{" "}
                    <code>jcs_data_engine_enabled</code> e/ou <code>smart_flow_ui_enabled</code>{" "}
                    estão desabilitadas nesta organização. O painel é exibido para diagnóstico,
                    mas a execução em lote pode falhar. Veja detalhes em "Diagnóstico".
                  </CardContent>
                </Card>
              )}
              <SmartProspectPanel />
            </TabsContent>
          )}
          <TabsContent value="import" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Importar Base de Leads</CardTitle>
                <CardDescription>
                  CSV, XLSX ou colar dados manualmente. Deduplicação automática mantém os leads
                  que já existem na plataforma.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate({ to: "/import" })}>Abrir tela de importação</Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <History />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="integrations" className="mt-4">
              <Integrations />
            </TabsContent>
          )}
          {isSuperadmin && (
            <TabsContent value="diagnostics" className="mt-4">
              <DiagnosticsPanel />
            </TabsContent>
          )}
        </Tabs>
      </div>
    );
  }

  // Flags OFF → tela legada 100% preservada.
  return (
    <div className="w-full">
        <PageHeader
          title="Prospecção"
          description="Encontre, enriqueça e qualifique empresas automaticamente."
        />
        <DashboardKpis />
        <Tabs defaultValue="new" className="mt-6">
          <TabsList>
            <TabsTrigger value="new">Nova busca</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="mt-4">
            <NewSearch />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <History />
          </TabsContent>
          <TabsContent value="integrations" className="mt-4">
            <Integrations />
          </TabsContent>
        </Tabs>
    </div>
  );
}

function DashboardKpis() {
  return <DashboardKpisInner />;
}

/**
 * Release 1.3.9 — Container que mantém o formulário e os resultados na mesma tela.
 * Após concluir a busca, o form recolhe e o painel de resultados aparece abaixo.
 */
function NewProspectionWithResults({ isAdmin }: { isAdmin: boolean }) {
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [currentIcpId, setCurrentIcpId] = useState<string | null>(null);
  const [currentMin, setCurrentMin] = useState<number>(80);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="space-y-4">
      <SimplifiedNewProspection
        collapsed={collapsed}
        onEditRequested={() => setCollapsed(false)}
        onSearchComplete={(sid, ctx) => {
          setCurrentSearchId(sid);
          setCurrentIcpId(ctx.icpId);
          setCurrentMin(ctx.minimumScore);
          setCollapsed(true);
          setTimeout(() => {
            document.getElementById("prospecting-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        }}
      />
      {currentSearchId && (
        <ProspectingResultsPanel
          searchId={currentSearchId}
          icpId={currentIcpId}
          minimumScore={currentMin}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function DiagnosticsPanel() {
  const fn = useServerFn(getProspectingDiagnostics);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["prospecting-diagnostics"],
    queryFn: () => fn(),
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando diagnóstico…</div>;
  const d: any = data ?? {};
  const flags = d.flags ?? {};
  const providers: any[] = d.providers ?? [];
  const blockers: string[] = d.blockers ?? [];
  const FlagRow = ({ k, v }: { k: string; v: boolean }) => (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <code className="text-xs">{k}</code>
      <Badge variant={v ? "default" : "destructive"}>{v ? "ON" : "OFF"}</Badge>
    </div>
  );
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico da Prospecção</CardTitle>
          <CardDescription>
            Visível apenas para SuperAdmin. Fluxo em uso: <strong>{d.flow_in_use === "smart_flow" ? "Smart Flow" : "Legado"}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2 text-sm">
            <div><span className="text-muted-foreground">organization_id:</span> <code>{d.organization_id ?? "—"}</code></div>
            <div><span className="text-muted-foreground">user_id:</span> <code>{d.user_id ?? "—"}</code></div>
            <div><span className="text-muted-foreground">roles:</span> <code>{(d.roles ?? []).join(", ") || "—"}</code></div>
            <div><span className="text-muted-foreground">provider padrão:</span> <code>{d.default_provider ?? "—"}</code></div>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Feature Flags</div>
            <FlagRow k="jcs_data_engine_enabled" v={!!flags.jcs_data_engine_enabled} />
            <FlagRow k="smart_flow_ui_enabled" v={!!flags.smart_flow_ui_enabled} />
            <FlagRow k="universal_icp_enabled" v={!!flags.universal_icp_enabled} />
            <FlagRow k="pre_icp_scoring_enabled" v={!!flags.pre_icp_scoring_enabled} />
            <FlagRow k="tenant_provider_settings_enabled" v={!!flags.tenant_provider_settings_enabled} />
          </div>
          {blockers.length > 0 && (
            <div className="text-sm text-amber-700 dark:text-amber-400">
              <strong>Bloqueando Smart Flow:</strong> {blockers.join(", ")}
            </div>
          )}
          <div>
            <div className="text-sm font-medium mb-1">Provedores ({providers.length})</div>
            {providers.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nenhum provedor configurado para esta organização.</div>
            ) : (
              <div className="space-y-1">
                {providers.map((p) => (
                  <div key={p.provider} className="flex items-center gap-2 text-xs">
                    <Badge variant={p.enabled ? "default" : "secondary"}>{p.enabled ? "ativo" : "off"}</Badge>
                    <code>{p.provider}</code>
                    <span className="text-muted-foreground">status: {p.status ?? "—"}</span>
                    <span className="text-muted-foreground">prio: {p.priority ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Atualizar</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardKpisInner() {
  const fn = useServerFn(getProspectingDashboard);
  const { data } = useQuery({ queryKey: ["prospecting-dash"], queryFn: () => fn() });
  const items = [
    { label: "Empresas encontradas", value: data?.empresas_encontradas ?? 0 },
    { label: "Empresas importadas", value: data?.empresas_importadas ?? 0 },
    { label: "Decisores", value: data?.decisores_encontrados ?? 0 },
    { label: "Buscas (30d)", value: data?.buscas_30d ?? 0 },
    { label: "Taxa enriquecimento", value: `${data?.taxa_enriquecimento ?? 0}%` },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-3">
      {items.map((i) => (
        <Card key={i.label}>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{i.label}</div>
            <div className="text-2xl font-semibold mt-1">{i.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NewSearch() {
  const fnSources = useServerFn(listSources);
  const fnCreate = useServerFn(createSearch);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: sources } = useQuery({ queryKey: ["prospecting-sources"], queryFn: () => fnSources() });
  const [selected, setSelected] = useState<any | null>(null);
  const [params, setParams] = useState<Record<string, any>>({});
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (d: { source: string; params: Record<string, any> }) => fnCreate({ data: d }),
    onSuccess: (r) => {
      toast.success("Busca concluída");
      setActiveSearchId(r.id);
      qc.invalidateQueries({ queryKey: ["prospecting-searches"] });
      qc.invalidateQueries({ queryKey: ["prospecting-dash"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (activeSearchId) {
    return <ResultsView searchId={activeSearchId} onBack={() => setActiveSearchId(null)} />;
  }

  if (!selected) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(sources?.items ?? []).map((s: any) => (
          <Card
            key={s.slug}
            className="cursor-pointer hover:border-primary transition"
            onClick={() => {
              if (s.slug === "xlsx" || s.slug === "csv") {
                navigate({ to: "/import" });
                return;
              }
              setSelected(s);
              setParams({});
            }}
          >
            <CardHeader>
              <CardTitle className="text-base">{s.name}</CardTitle>
              <CardDescription className="text-xs">{s.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  const fields = (selected.config_schema?.fields ?? []) as any[];

  if (selected.slug === "casa_dos_dados") {
    return (
      <CasaDosDadosForm
        source={selected}
        onBack={() => setSelected(null)}
        pending={create.isPending}
        onSubmit={(params) => create.mutate({ source: selected.slug, params })}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{selected.name}</CardTitle>
            <CardDescription>{selected.description}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            Trocar fonte
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((f: any) => (
          <div key={f.key}>
            <Label>
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </Label>
            {f.type === "textarea" ? (
              <textarea
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                rows={4}
                onChange={(e) => setParams((p) => ({ ...p, [f.key]: e.target.value }))}
              />
            ) : (
              <Input
                type={f.type === "number" ? "number" : "text"}
                className="mt-1"
                defaultValue={f.default ?? ""}
                onChange={(e) =>
                  setParams((p) => ({
                    ...p,
                    [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                  }))
                }
              />
            )}
          </div>
        ))}
        <Button
          disabled={create.isPending}
          onClick={() => create.mutate({ source: selected.slug, params })}
        >
          {create.isPending ? "Buscando…" : "Iniciar busca"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CasaDosDadosForm({
  source,
  onBack,
  onSubmit,
  pending,
}: {
  source: any;
  onBack: () => void;
  onSubmit: (params: Record<string, any>) => void;
  pending: boolean;
}) {
  const [cnae, setCnae] = useState<CnaeOption | null>(null);
  const [cnaeOpen, setCnaeOpen] = useState(false);
  const [uf, setUf] = useState("");
  const [cidade, setCidade] = useState("");
  const [porte, setPorte] = useState<string>("");
  const [situacao, setSituacao] = useState("ATIVA");
  const [limite, setLimite] = useState(100);
  const [comTelefone, setComTelefone] = useState(false);
  const [comCelular, setComCelular] = useState(false);
  const [comEmail, setComEmail] = useState(false);
  const [funcMin, setFuncMin] = useState<number | "">("");

  function submit() {
    // Deriva porte por # funcionários caso não escolhido manualmente:
    // ME (até 9), EPP (10-49), DEMAIS (50+). Empresas com 10+ funcionários = EPP + DEMAIS.
    let porteEff: string | string[] = porte;
    if (!porteEff && typeof funcMin === "number" && funcMin >= 10) {
      porteEff = funcMin >= 50 ? "DEMAIS" : ["EPP", "DEMAIS"];
    }
    onSubmit({
      cnae_principal: cnae?.code ?? "",
      uf: uf.trim(),
      cidade: cidade.trim(),
      porte: porteEff,
      situacao_cadastral: situacao,
      limite: Number(limite) || 100,
      com_telefone: comTelefone,
      com_celular: comCelular,
      com_email: comEmail,
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{source.name}</CardTitle>
            <CardDescription>
              Filtre por CNAE, região, porte e dados de contato.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Trocar fonte
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Atividade (CNAE) *</Label>
          <Popover open={cnaeOpen} onOpenChange={setCnaeOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full mt-1 justify-between font-normal"
              >
                {cnae
                  ? `${cnae.code} · ${cnae.label}`
                  : "Selecione ou busque por nome (ex.: contabilidade, advocacia)"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command
                filter={(value, search) => {
                  const s = search.toLowerCase();
                  return value.toLowerCase().includes(s) ? 1 : 0;
                }}
              >
                <CommandInput placeholder="Buscar CNAE por nome ou código..." />
                <CommandList>
                  <CommandEmpty>Nenhum CNAE encontrado.</CommandEmpty>
                  <CommandGroup>
                    {CNAE_LIST.map((c) => (
                      <CommandItem
                        key={c.code}
                        value={`${c.code} ${c.label}`}
                        onSelect={() => {
                          setCnae(c);
                          setCnaeOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            cnae?.code === c.code ? "opacity-100" : "opacity-0",
                          )}
                        />
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>UF</Label>
            <UfSelect value={uf} onChange={setUf} />
          </div>
          <div>
            <Label>Cidade</Label>
            <CidadeAutocomplete uf={uf} value={cidade} onChange={setCidade} />
          </div>
          <div>
            <Label>Porte</Label>
            <select
              className="mt-1 w-full h-9 border rounded-md px-2 text-sm bg-background"
              value={porte}
              onChange={(e) => setPorte(e.target.value)}
            >
              <option value="">Qualquer</option>
              <option value="ME">ME (Microempresa)</option>
              <option value="EPP">EPP (Pequeno porte)</option>
              <option value="DEMAIS">Demais (Médio/Grande)</option>
            </select>
          </div>
          <div>
            <Label>Situação cadastral</Label>
            <select
              className="mt-1 w-full h-9 border rounded-md px-2 text-sm bg-background"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value)}
            >
              <option value="ATIVA">Ativa</option>
              <option value="BAIXADA">Baixada</option>
              <option value="SUSPENSA">Suspensa</option>
              <option value="INAPTA">Inapta</option>
            </select>
          </div>
          <div>
            <Label>Mín. funcionários (estimado)</Label>
            <Input
              type="number"
              min={0}
              className="mt-1"
              placeholder="ex.: 10"
              value={funcMin}
              onChange={(e) => setFuncMin(e.target.value === "" ? "" : Number(e.target.value))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              10+ define porte mínimo EPP automaticamente.
            </p>
          </div>
          <div>
            <Label>Limite de resultados</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              className="mt-1"
              value={limite}
              onChange={(e) => setLimite(Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Filtros de contato</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={comTelefone} onCheckedChange={(v) => setComTelefone(!!v)} />
              Com telefone
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={comCelular} onCheckedChange={(v) => setComCelular(!!v)} />
              Com celular
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={comEmail} onCheckedChange={(v) => setComEmail(!!v)} />
              Com e-mail
            </label>
          </div>
        </div>

        <Button disabled={!cnae || pending} onClick={submit}>
          {pending ? "Buscando…" : "Iniciar busca"}
        </Button>
      </CardContent>
    </Card>
  );
}

const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function UfSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      className="mt-1 w-full h-9 border rounded-md px-2 text-sm bg-background"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Todas</option>
      {UF_LIST.map((u) => (
        <option key={u} value={u}>{u}</option>
      ))}
    </select>
  );
}

function CidadeAutocomplete({
  uf,
  value,
  onChange,
}: {
  uf: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [cities, setCities] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!uf) { setCities([]); return; }
    let alive = true;
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setCities(Array.isArray(j) ? j.map((m: any) => m.nome).sort() : []);
      })
      .catch(() => alive && setCities([]));
    return () => { alive = false; };
  }, [uf]);
  const filtered = useMemo(() => {
    const s = value.trim().toLowerCase();
    if (!s) return cities;
    return cities.filter((c) => c.toLowerCase().includes(s));
  }, [cities, value]);
  return (
    <div className="relative">
      <Input
        className="mt-1"
        placeholder={uf ? "Digite a cidade" : "Selecione a UF primeiro"}
        value={value}
        disabled={!uf}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border bg-popover shadow-md">
          {filtered.map((c) => (
            <button
              type="button"
              key={c}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); onChange(c); setOpen(false); }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultsView({ searchId, onBack }: { searchId: string; onBack: () => void }) {
  const fnList = useServerFn(listResults);
  const fnImport = useServerFn(importResults);
  const fnEnrich = useServerFn(enrichResult);
  const fnEnrichSel = useServerFn(enrichSelected);
  const fnFlag = useServerFn(getFeatureFlag);
  const fnUniFlag = useServerFn(getUniversalIcpFlag);
  const fnScoresList = useServerFn(listScoresForSearch);
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openDM, setOpenDM] = useState<string | null>(null);
  const [icpDialog, setIcpDialog] = useState(false);
  const [activeIcpId, setActiveIcpId] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<IcpRating | "all" | "qualified">("all");
  const [expandedScoreId, setExpandedScoreId] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<ClassificationSummary | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["prospecting-results", searchId, filters],
    queryFn: () => fnList({ data: { searchId, filters } }),
  });
  const { data: flag } = useQuery({ queryKey: ["icp-flag"], queryFn: () => fnFlag() });
  const { data: uniFlag } = useQuery({ queryKey: ["icp-universal-flag"], queryFn: () => fnUniFlag() });
  const resultIds = (data?.items ?? []).map((r: any) => r.id);
  const { data: scoresData } = useQuery({
    queryKey: ["icp-scores", activeIcpId, searchId, resultIds.length],
    queryFn: () => fnScoresList({ data: { icpId: activeIcpId!, resultIds } }),
    enabled: Boolean(activeIcpId) && resultIds.length > 0,
  });
  const scoreMap = new Map<string, any>((scoresData?.items ?? []).map((s: any) => [s.prospecting_result_id, s]));

  const importMut = useMutation({
    mutationFn: (ids: string[]) => fnImport({ data: { ids, addToCadence: false } }),
    onSuccess: (r: any) => {
      if (r.inserted > 0) toast.success(`${r.inserted} lead(s) enviados para a aba Leads`);
      if (r.failed > 0) toast.error(`${r.failed} falha(s): ${(r.errors ?? []).join("; ")}`);
      if (!r.inserted && !r.failed) toast.message("Nenhum lead importado");
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["prospecting-results", searchId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const importCadenceMut = useMutation({
    mutationFn: (ids: string[]) => fnImport({ data: { ids, addToCadence: true } }),
    onSuccess: (r: any) => {
      if (r.inserted > 0) toast.success(`${r.inserted} lead(s) importados em cadência`);
      if (r.failed > 0) toast.error(`${r.failed} falha(s): ${(r.errors ?? []).join("; ")}`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["prospecting-results", searchId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const enrichMut = useMutation({
    mutationFn: (id: string) => fnEnrich({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospecting-results", searchId] }),
  });
  const enrichSelMut = useMutation({
    mutationFn: (ids: string[]) => fnEnrichSel({ data: { ids } }),
    onSuccess: (r: any) => {
      toast.success(
        `Enriquecimento: ${r.processed} processadas, ${r.skipped} puladas, ${r.failed} falhas`,
      );
      qc.invalidateQueries({ queryKey: ["prospecting-results", searchId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  // Aplica filtro de rating (apenas visual — não altera dados brutos).
  const filteredItems = useMemo(() => {
    if (!activeIcpId || ratingFilter === "all") return items;
    return items.filter((r: any) => {
      const s = scoreMap.get(r.id);
      if (!s) return false;
      if (ratingFilter === "qualified") return s.qualified_for_import;
      return ratingFromScore(s.icp_score) === ratingFilter;
    });
  }, [items, scoreMap, ratingFilter, activeIcpId]);
  const allChecked = filteredItems.length > 0 && filteredItems.every((i: any) => selectedIds.has(i.id));
  const enrichedCount = items.filter((r: any) => r.status === "enriched" || (r.technologies?.length ?? 0) > 0 || r.email).length;
  const enrichedPct = items.length > 0 ? Math.round((enrichedCount / items.length) * 100) : 0;
  function toggleAll() {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredItems.map((i: any) => i.id)));
  }

  /** Seleciona IDs de acordo com um filtro de score, sem alterar fluxo antigo. */
  function selectByScore(pred: (s: any) => boolean) {
    const s = new Set<string>();
    for (const r of items) {
      const sc = scoreMap.get(r.id);
      if (sc && pred(sc)) s.add(r.id);
    }
    setSelectedIds(s);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Nova busca
        </Button>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={selectedIds.size === 0 || enrichSelMut.isPending}
            onClick={() => enrichSelMut.mutate(Array.from(selectedIds))}
          >
            {enrichSelMut.isPending ? "Enriquecendo…" : `Enriquecer selecionadas (${selectedIds.size})`}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.size === 0 || importMut.isPending}
            onClick={() => importMut.mutate(Array.from(selectedIds))}
          >
            Importar selecionados ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.size === 0 || importCadenceMut.isPending}
            onClick={() => importCadenceMut.mutate(Array.from(selectedIds))}
          >
            Importar + cadência
          </Button>
          {flag?.enabled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIcpDialog(true)}
            >
              Classificar pelo ICP{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          )}
          {activeIcpId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">Importar por score ▾</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { selectByScore((s) => s.icp_score >= 80); }}>
                  Selecionar Score ≥ 80 (Bom+)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { selectByScore((s) => s.icp_score >= 90); }}>
                  Selecionar Score ≥ 90
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { selectByScore((s) => s.icp_score >= 95); }}>
                  Selecionar apenas Excelente (≥ 95)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const sorted = [...items]
                    .map((r: any) => ({ id: r.id, score: scoreMap.get(r.id)?.icp_score ?? 0 }))
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 100)
                    .map((x) => x.id);
                  setSelectedIds(new Set(sorted));
                }}>
                  Selecionar Top 100 por Score
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {icpDialog && (
        <ClassifyByIcpDialog
          resultIds={Array.from(selectedIds)}
          allResultIds={resultIds}
          universalEnabled={Boolean(uniFlag?.enabled)}
          onClose={() => setIcpDialog(false)}
          onDone={(icpId, summary) => {
            setActiveIcpId(icpId);
            setIcpDialog(false);
            setLastSummary(summary ?? null);
            qc.invalidateQueries({ queryKey: ["icp-scores"] });
          }}
        />
      )}

      {activeIcpId && lastSummary && (
        <Card>
          <CardContent className="p-3 grid grid-cols-2 md:grid-cols-8 gap-3 text-xs">
            <Stat label="Empresas" value={lastSummary.total} />
            <Stat label="Excelente" value={lastSummary.excelente} tone="emerald" />
            <Stat label="Bom" value={lastSummary.bom} tone="green" />
            <Stat label="Potencial" value={lastSummary.potencial} tone="amber" />
            <Stat label="Frio" value={lastSummary.frio} tone="slate" />
            <Stat label="Fora" value={lastSummary.fora} tone="red" />
            <Stat label="Média" value={`${lastSummary.avg}%`} />
            <Stat label="Máx / Mín" value={`${lastSummary.max} / ${lastSummary.min}`} />
            <Stat label="Tempo" value={`${lastSummary.duration_ms} ms`} />
          </CardContent>
        </Card>
      )}

      {activeIcpId && (
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2 items-center text-xs">
            <span className="text-muted-foreground">Filtro rápido:</span>
            {[
              ["all", "Todos"],
              ["qualified", "Score ≥ mínimo"],
              ["Excelente", "🟢 Excelente"],
              ["Bom", "🟢 Bom"],
              ["Potencial", "🟡 Potencial"],
              ["Frio", "⚪ Frio"],
              ["Fora", "🔴 Fora"],
            ].map(([k, l]) => (
              <Button
                key={k as string}
                size="sm"
                variant={ratingFilter === k ? "default" : "outline"}
                onClick={() => setRatingFilter(k as any)}
              >
                {l}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">Cidade</Label>
            <Input
              className="h-8 w-36"
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value || undefined }))}
            />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Input
              className="h-8 w-20"
              onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value || undefined }))}
            />
          </div>
          <div>
            <Label className="text-xs">Segmento</Label>
            <Input
              className="h-8 w-36"
              onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value || undefined }))}
            />
          </div>
          {[
            ["has_website", "Site"],
            ["has_email", "Email"],
            ["has_phone", "Telefone"],
            ["has_linkedin", "LinkedIn"],
            ["has_instagram", "Instagram"],
            ["has_cnae", "CNAE"],
            ["has_decision_makers", "Decisores"],
          ].map(([k, l]) => (
            <label key={k} className="flex items-center gap-1 text-xs">
              <Checkbox
                onCheckedChange={(v) => setFilters((f) => ({ ...f, [k as string]: v ? true : undefined }))}
              />
              {l}
            </label>
          ))}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{enrichedCount}</span> de {items.length} leads enriquecidos
            </div>
            <Badge variant={enrichedPct >= 90 ? "default" : enrichedPct >= 50 ? "secondary" : "outline"}>
              {enrichedPct}% (meta: 90%)
            </Badge>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhuma empresa encontrada.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="p-2">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                  </th>
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Cidade/UF</th>
                  <th className="p-2">Score</th>
                  {activeIcpId && <th className="p-2">ICP</th>}
                  <th className="p-2">Enriquecimento</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((r: any) => (
                  <>
                  <tr key={r.id} className="border-b">
                    <td className="p-2">
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={(v) => {
                          const s = new Set(selectedIds);
                          if (v) s.add(r.id);
                          else s.delete(r.id);
                          setSelectedIds(s);
                        }}
                      />
                    </td>
                    <td className="p-2 font-medium">{r.company_name}</td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {[r.city, r.state].filter(Boolean).join("/")}
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={
                          r.score_label === "quente"
                            ? "default"
                            : r.score_label === "morno"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {r.score} · {r.score_label ?? "—"}
                      </Badge>
                    </td>
                    {activeIcpId && (
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => setExpandedScoreId(expandedScoreId === r.id ? null : r.id)}
                          className="inline-flex"
                          title="Ver motivo do score"
                        >
                          <IcpScoreBadge s={scoreMap.get(r.id)} />
                        </button>
                      </td>
                    )}
                    <td className="p-2">
                      <EnrichmentBadges r={r} />
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenDM(openDM === r.id ? null : r.id)}
                      >
                        Decisores
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => enrichMut.mutate(r.id)}
                        disabled={enrichMut.isPending}
                      >
                        Re-enriquecer
                      </Button>
                    </td>
                  </tr>
                  {expandedScoreId === r.id && activeIcpId && (
                    <tr key={`${r.id}-score`} className="border-b bg-muted/10">
                      <td colSpan={7} className="p-3">
                        <ScoreReasonsPanel score={scoreMap.get(r.id)} />
                      </td>
                    </tr>
                  )}
                  {openDM === r.id && (
                    <tr key={`${r.id}-dm`} className="border-b bg-muted/20">
                      <td colSpan={activeIcpId ? 7 : 6} className="p-3">
                        <DecisionMakersPanel resultId={r.id} />
                      </td>
                    </tr>
                  )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function History() {
  return <HistoryInner />;
}

function EnrichmentBadges({ r }: { r: any }) {
  const items: Array<[string, boolean]> = [
    ["Site", !!r.website],
    ["LinkedIn", !!r.linkedin_url],
    ["Instagram", !!r.instagram_url],
    ["CNAE", !!r.cnae],
    ["Score", typeof r.score === "number" && r.score > 0],
    ["Segmento", !!r.segment],
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(([label, ok]) => (
        <Badge key={label} variant={ok ? "secondary" : "outline"} className={ok ? "" : "opacity-50"}>
          {ok ? "✓" : "○"} {label}
        </Badge>
      ))}
    </div>
  );
}

function ClassifyByIcpDialog({
  resultIds,
  allResultIds,
  universalEnabled,
  onClose,
  onDone,
}: {
  resultIds: string[];
  allResultIds: string[];
  universalEnabled: boolean;
  onClose: () => void;
  onDone: (icpId: string, summary?: ClassificationSummary) => void;
}) {
  const fnList = useServerFn(listIcps);
  const fnScore = useServerFn(scoreResults);
  const fnListProducts = useServerFn(listProducts);
  const fnClassify = useServerFn(classifyUniversal);
  const { data } = useQuery({ queryKey: ["icps"], queryFn: () => fnList() });
  const { data: prodData } = useQuery({ queryKey: ["products-active"], queryFn: () => fnListProducts() });
  const [icpId, setIcpId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  // Se nenhuma linha estiver selecionada, classifica todas as visíveis.
  const targetIds = resultIds.length > 0 ? resultIds : allResultIds;
  const run = useMutation({
    mutationFn: async () => {
      if (universalEnabled) {
        return await fnClassify({
          data: {
            icpId: icpId || undefined,
            productId: !icpId ? (productId || undefined) : undefined,
            resultIds: targetIds,
            persist: true,
          },
        });
      }
      const r: any = await fnScore({ data: { icpId, resultIds: targetIds } });
      return {
        icpId,
        scores: [],
        summary: {
          total: targetIds.length,
          excelente: 0, bom: r.good ?? 0, potencial: r.review ?? 0, frio: 0, fora: r.outside ?? 0,
          avg: 0, max: 0, min: 0, duration_ms: 0,
        } as ClassificationSummary,
      };
    },
    onSuccess: (r: any) => {
      const s: ClassificationSummary = r.summary;
      toast.success(
        `Classificado: ${s.excelente} excelente · ${s.bom} bom · ${s.potencial} potencial · ${s.frio} frio · ${s.fora} fora`,
      );
      onDone(r.icpId, s);
    },
    onError: (e: any) => toast.error(e.message),
  });
  const active = (data?.items ?? []).filter((i: any) => i.status === "active");
  const activeProducts = (prodData?.items ?? []).filter((p: any) => p.status === "active");
  const canRun = (icpId || (universalEnabled && productId)) && targetIds.length > 0;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Classificar pelo ICP</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {targetIds.length} empresa(s){resultIds.length === 0 ? " (todas visíveis)" : " selecionada(s)"}. Nenhuma será excluída — apenas classificadas.
          </div>
          {universalEnabled && (
            <div className="space-y-1">
              <Label className="text-xs">Produto (opcional)</Label>
              <Select value={productId} onValueChange={(v) => { setProductId(v); setIcpId(""); }}>
                <SelectTrigger><SelectValue placeholder="Escolha um produto (usa o ICP vinculado)" /></SelectTrigger>
                <SelectContent>
                  {activeProducts.map((p: any) => (
                    <SelectItem key={p.id} value={p.id} disabled={!p.icp_id}>
                      {p.nome}{!p.icp_id ? " — sem ICP vinculado" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">ICP</Label>
          <Select value={icpId} onValueChange={setIcpId}>
            <SelectTrigger><SelectValue placeholder="Escolha um ICP ativo" /></SelectTrigger>
            <SelectContent>
              {active.map((i: any) => (
                <SelectItem key={i.id} value={i.id}>{i.name} (mín: {i.minimum_score}%)</SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>
          {active.length === 0 && (
            <div className="text-xs text-muted-foreground">Cadastre um ICP em "Público Ideal (ICP)".</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canRun || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? "Calculando…" : "Calcular scores"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IcpScoreBadge({ s }: { s: any }) {
  if (!s) return <Badge variant="outline" className="opacity-50">ICP —</Badge>;
  const rating = ratingFromScore(s.icp_score ?? 0);
  const cls =
    rating === "Excelente"
      ? "bg-emerald-500 text-white hover:bg-emerald-500"
      : rating === "Bom"
        ? "bg-green-500 text-white hover:bg-green-500"
        : rating === "Potencial"
          ? "bg-amber-500 text-white hover:bg-amber-500"
          : rating === "Frio"
            ? "bg-slate-400 text-white hover:bg-slate-400"
            : "bg-red-500 text-white hover:bg-red-500";
  const dot = rating === "Excelente" || rating === "Bom" ? "🟢" : rating === "Potencial" ? "🟡" : rating === "Frio" ? "⚪" : "🔴";
  return <Badge className={cls}>{dot} {s.icp_score}% · {rating}</Badge>;
}

// ---------------------------------------------------------------------------
// Componentes auxiliares — apresentacionais apenas (SEM lógica de score).
// ---------------------------------------------------------------------------
function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  const toneClass =
    tone === "emerald" ? "text-emerald-600"
    : tone === "green" ? "text-green-600"
    : tone === "amber" ? "text-amber-600"
    : tone === "red" ? "text-red-600"
    : "";
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function ScoreReasonsPanel({ score }: { score: any }) {
  if (!score) {
    return <div className="text-xs text-muted-foreground">Sem classificação ainda para esta empresa.</div>;
  }
  const matched: string[] = Array.isArray(score.matched_criteria) ? score.matched_criteria : [];
  const missing: string[] = Array.isArray(score.missing_criteria) ? score.missing_criteria : [];
  const disq: string[] = Array.isArray(score.disqualifying_reasons) ? score.disqualifying_reasons : [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
      <div>
        <div className="font-medium text-emerald-700 mb-1">Critérios atendidos</div>
        {matched.length === 0 ? <div className="text-muted-foreground">—</div> :
          <ul className="space-y-0.5">{matched.map((m) => <li key={m}>+ {m}</li>)}</ul>}
      </div>
      <div>
        <div className="font-medium text-amber-700 mb-1">Critérios ausentes</div>
        {missing.length === 0 ? <div className="text-muted-foreground">—</div> :
          <ul className="space-y-0.5">{missing.map((m) => <li key={m}>- {m}</li>)}</ul>}
      </div>
      <div>
        <div className="font-medium text-red-700 mb-1">Desqualificadores</div>
        {disq.length === 0 ? <div className="text-muted-foreground">—</div> :
          <ul className="space-y-0.5">{disq.map((m) => <li key={m}>✗ {m}</li>)}</ul>}
      </div>
    </div>
  );
}

function DecisionMakersPanel({ resultId }: { resultId: string }) {
  const fnList = useServerFn(listDecisionMakers);
  const fnFind = useServerFn(findDecisionMakers);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["dm", resultId],
    queryFn: () => fnList({ data: { resultId } }),
  });
  const find = useMutation({
    mutationFn: () => fnFind({ data: { resultId } }),
    onSuccess: (r: any) => {
      if (r?.note) toast.info(r.note);
      else toast.success(`${r?.found ?? 0} decisores encontrados`);
      qc.invalidateQueries({ queryKey: ["dm", resultId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const items = data?.items ?? [];
  const roleVariant = (lvl?: string) => {
    const l = (lvl ?? "").toLowerCase();
    if (l.includes("ceo") || l.includes("c-level")) return "default";
    if (l.includes("diretor") || l.includes("director")) return "secondary";
    return "outline";
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">Decisores (CEO, Diretor, Financeiro, TI)</div>
        <Button size="sm" variant="outline" disabled={find.isPending} onClick={() => find.mutate()}>
          {find.isPending ? "Buscando…" : "Buscar decisores"}
        </Button>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          Nenhum decisor encontrado. Configure o actor LinkedIn no Apify para ativar a busca.
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((d: any) => (
            <div key={d.id} className="flex items-center gap-2 text-xs flex-wrap">
              <Badge variant={roleVariant(d.level ?? d.role)}>{d.level ?? d.role ?? "—"}</Badge>
              <span className="font-medium">{d.name}</span>
              {d.role && <span className="text-muted-foreground">· {d.role}</span>}
              {d.email && <span className="text-muted-foreground">· {d.email}</span>}
              {d.linkedin && (
                <a href={d.linkedin} target="_blank" rel="noreferrer" className="underline">
                  LinkedIn
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryInner() {
  const fn = useServerFn(listSearches);
  const { data } = useQuery({ queryKey: ["prospecting-searches"], queryFn: () => fn() });
  const [openId, setOpenId] = useState<string | null>(null);
  if (openId) return <ResultsView searchId={openId} onBack={() => setOpenId(null)} />;
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-left">
              <th className="p-2">Fonte</th>
              <th className="p-2">Status</th>
              <th className="p-2">Encontradas</th>
              <th className="p-2">Importadas</th>
              <th className="p-2">Quando</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((s: any) => (
              <tr key={s.id} className="border-b">
                <td className="p-2">{s.source_slug}</td>
                <td className="p-2">
                  <Badge variant={s.status === "done" ? "default" : s.status === "failed" ? "destructive" : "secondary"}>
                    {s.status}
                  </Badge>
                </td>
                <td className="p-2">{s.total_found}</td>
                <td className="p-2">{s.total_imported}</td>
                <td className="p-2 text-xs text-muted-foreground">
                  {new Date(s.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="p-2">
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(s.id)}>
                    Ver
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Integrations() {
  const listFn = useServerFn(listProviders);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["prospecting-integrations"],
    queryFn: () => listFn(),
  });
  const [editing, setEditing] = useState<(ProviderMeta & { credential: any }) | null>(null);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Carregando integrações…</div>;
  }
  if (!data) return null;

  if (!data.flag_enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integrações de Prospecção</CardTitle>
          <CardDescription>
            Central de configuração das fontes de dados utilizadas pela prospecção.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Recurso em rollout controlado. Solicite à equipe JCS para habilitar em sua organização.
        </CardContent>
      </Card>
    );
  }

  // Only providers with a functional adapter are configurable.
  const configurable = (data.providers as any[]).filter((p) => p.adapterAvailable);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["prospecting-integrations"] });

  // Summary
  const activos = configurable.filter((p) => p.credential?.enabled !== false && p.credential?.status === "connected").length;
  const comErro = configurable.filter((p) => {
    const s = p.credential?.status;
    return s && !["connected", "unknown", null, undefined].includes(s) && p.credential?.enabled !== false;
  }).length;
  const saldoBaixo = configurable.filter((p) => p.credential?.status === "insufficient_balance").length;
  const ultimaSync = configurable
    .map((p) => p.credential?.last_test_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Integrações de Prospecção</h3>
        <p className="text-sm text-muted-foreground">
          Configure aqui todas as fontes de dados usadas pela prospecção. Segredos ficam cifrados
          e nunca voltam ao navegador.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {configurable.map((p) => (
          <ProviderCard
            key={p.id}
            row={p}
            onConfigure={() => setEditing(p)}
            onChanged={invalidate}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Resumo das Integrações</CardTitle>
          <CardDescription>Indicadores atuais da sua organização.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Kpi label="Providers ativos" value={activos} />
            <Kpi label="Providers com erro" value={comErro} />
            <Kpi label="Saldo baixo" value={saldoBaixo} />
            <Kpi
              label="Última sincronização"
              value={ultimaSync ? new Date(ultimaSync as string).toLocaleString("pt-BR") : "—"}
            />
          </div>
        </CardContent>
      </Card>

      {editing ? (
        <ProviderDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "connected": return "Conectado";
    case "invalid_credentials": return "Credencial inválida";
    case "insufficient_balance": return "Saldo insuficiente";
    case "rate_limited": return "Rate limit";
    case "unavailable": return "Indisponível";
    case "invalid_base_url": return "URL inválida";
    case "unsupported_adapter": return "Sem adapter";
    case "not_connected": return "Desconectado";
    case "disabled": return "Desativado";
    default: return "Aguardando teste";
  }
}

function sourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "organization": return "Organização";
    case "platform": return "Plataforma";
    case "legacy_env": return "Legacy";
    default: return "—";
  }
}

function ProviderCard({
  row,
  onConfigure,
  onChanged,
}: {
  row: ProviderMeta & { credential: any };
  onConfigure: () => void;
  onChanged: () => void;
}) {
  const testFn = useServerFn(testProviderConnection);
  const delFn = useServerFn(deleteProviderCredential);
  const toggleFn = useServerFn(setProviderEnabled);
  const [testing, setTesting] = useState(false);
  const [lastSource, setLastSource] = useState<string | null>(null);
  const cred = row.credential;
  const enabled: boolean = cred?.enabled !== false;
  const status: string = cred ? (enabled ? cred?.status ?? "unknown" : "disabled") : "not_connected";
  const badgeVariant =
    status === "connected"
      ? "default"
      : status === "not_connected" || status === "disabled" || status === "unknown"
      ? "outline"
      : ("secondary" as const);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>{row.name}</span>
          <Badge variant={badgeVariant as any}>{statusLabel(status)}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">{row.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {cred?.last4 ? <p>API Key: ••••{cred.last4}</p> : <p className="text-muted-foreground">Nenhuma credencial cadastrada.</p>}
        <div className="text-xs text-muted-foreground space-y-0.5">
          {cred?.priority != null ? <p>Prioridade: {cred.priority}</p> : null}
          {cred?.last_test_at ? <p>Último teste: {new Date(cred.last_test_at).toLocaleString("pt-BR")}</p> : null}
          {cred?.last_success_at ? <p>Último uso: {new Date(cred.last_success_at).toLocaleString("pt-BR")}</p> : null}
          {lastSource ? <p>Origem da credencial: {sourceLabel(lastSource)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={onConfigure}>Configurar</Button>
          {cred ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={testing || !enabled}
                onClick={async () => {
                  setTesting(true);
                  try {
                    const res: any = await testFn({ data: { provider: row.id } });
                    setLastSource(res.source ?? null);
                    toast[res.result === "connected" ? "success" : "error"](res.message);
                    onChanged();
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? "Testando…" : "Testar conexão"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await toggleFn({ data: { provider: row.id, enabled: !enabled } });
                  toast.success(enabled ? "Provedor desativado." : "Provedor ativado.");
                  onChanged();
                }}
              >
                {enabled ? "Desativar" : "Ativar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  if (!confirm("Remover a credencial deste provedor? Esta ação apaga a chave cifrada.")) return;
                  await delFn({ data: { provider: row.id } });
                  toast.success("Credencial removida.");
                  onChanged();
                }}
              >
                Remover
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ProviderMeta & { credential: any };
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(saveProviderCredential);
  const cred = row.credential;
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState<string>(cred?.base_url ?? row.defaultBaseUrl ?? "");
  const [mode, setMode] = useState<"organization" | "platform" | "disabled">(
    (cred?.credential_mode ?? "organization") as any,
  );
  const [priority, setPriority] = useState<number>(cred?.priority ?? 100);
  const [dailyLimit, setDailyLimit] = useState<number | "">((cred?.daily_limit ?? "") as number | "");
  const [monthlyLimit, setMonthlyLimit] = useState<number | "">((cred?.monthly_limit ?? "") as number | "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar {row.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>API Key</Label>
            <Input
              type="password"
              autoComplete="off"
              placeholder={cred?.last4 ? `••••${cred.last4}` : "Cole a chave"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {cred ? "Deixe em branco para preservar a credencial atual." : "Será cifrada e nunca voltará ao navegador."}
            </p>
          </div>
          <div>
            <Label>URL Base</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={row.defaultBaseUrl ?? "https://..."}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Modo</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Minha conta</SelectItem>
                  <SelectItem value="platform">Créditos JCS SDR</SelectItem>
                  <SelectItem value="disabled">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Limite diário</Label>
              <Input
                type="number"
                min={0}
                placeholder="Sem limite"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div>
              <Label>Limite mensal</Label>
              <Input
                type="number"
                min={0}
                placeholder="Sem limite"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await saveFn({
                  data: {
                    provider: row.id,
                    mode,
                    apiKey: apiKey || undefined,
                    baseUrl: baseUrl || undefined,
                    priority,
                    daily_limit: dailyLimit === "" ? undefined : dailyLimit,
                    monthly_limit: monthlyLimit === "" ? undefined : monthlyLimit,
                  },
                });
                toast.success("Credencial salva.");
                onSaved();
              } catch (e: any) {
                toast.error(e?.message ?? "Erro ao salvar.");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
