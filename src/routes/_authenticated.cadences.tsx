import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { cadenceKpis } from "@/lib/leads.functions";
import {
  listVariants,
  upsertVariant,
  deleteVariant,
} from "@/lib/cadence-variants.functions";
import {
  listCadences,
  upsertCadence,
  setCadenceStatus,
  duplicateCadence,
  CADENCE_CATEGORIES,
} from "@/lib/cadences.functions";

export const Route = createFileRoute("/_authenticated/cadences")({
  head: () => ({ meta: [{ title: "Cadências A/B — JCS SDR" }] }),
  component: CadencesPage,
});

type Variant = {
  id: string;
  cadence_day: number;
  channel: "whatsapp" | "email";
  variant_key: string;
  subject: string | null;
  body_template: string;
  weight: number;
  active: boolean;
  sent_count: number;
  reply_count: number;
  positive_count: number;
};

function emptyForm() {
  return {
    id: undefined as string | undefined,
    cadence_day: 1,
    channel: "whatsapp" as "whatsapp" | "email",
    variant_key: "A",
    subject: "",
    body_template: "",
    weight: 1,
    active: true,
  };
}

function CadencesPage() {
  const list = useServerFn(listVariants);
  const upsert = useServerFn(upsertVariant);
  const del = useServerFn(deleteVariant);
  const [items, setItems] = useState<Variant[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  async function reload() {
    const r = await list();
    setItems((r.items as Variant[]) ?? []);
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: { ...form, subject: form.subject || null } as never,
      });
      toast.success("Variante salva");
      setForm(emptyForm());
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir variante?")) return;
    try {
      await del({ data: { id } });
      await reload();
    } catch (e) { toast.error((e as Error).message); }
  }

  function edit(v: Variant) {
    setForm({
      id: v.id,
      cadence_day: v.cadence_day,
      channel: v.channel,
      variant_key: v.variant_key,
      subject: v.subject ?? "",
      body_template: v.body_template,
      weight: v.weight,
      active: v.active,
    });
  }

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Cadências A/B"
        description="Variantes de copy por passo da cadência. Pesos definem probabilidade; reply/positive rate mostram o vencedor."
      />
      <Tabs defaultValue="variants" className="space-y-5">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="cadences">Cadências</TabsTrigger>
          <TabsTrigger value="variants">Variantes</TabsTrigger>
          <TabsTrigger value="results">Resultados</TabsTrigger>
        </TabsList>
        <TabsContent value="cadences">
          <CadencesListTab />
        </TabsContent>
        <TabsContent value="variants">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(19rem,25rem)_minmax(0,1fr)]">
        <Card className="xl:sticky xl:top-5">
          <CardHeader><CardTitle>{form.id ? "Editar variante" : "Nova variante"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Dia da cadência</Label>
                <Input type="number" value={form.cadence_day}
                  onChange={(e) => setForm({ ...form, cadence_day: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Canal</Label>
                <select className="w-full border rounded-md h-9 px-2 bg-background"
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value as "whatsapp" | "email" })}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                </select>
              </div>
              <div>
                <Label>Chave (A/B/C)</Label>
                <Input value={form.variant_key}
                  onChange={(e) => setForm({ ...form, variant_key: e.target.value })} />
              </div>
              <div>
                <Label>Peso</Label>
                <Input type="number" value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
              </div>
            </div>
            {form.channel === "email" && (
              <div>
                <Label>Assunto</Label>
                <Input value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
            )}
            <div>
              <Label>Corpo (template)</Label>
              <Textarea rows={8} value={form.body_template}
                onChange={(e) => setForm({ ...form, body_template: e.target.value })}
                placeholder="Use {{nome}}, {{empresa}}, {{segmento}} como placeholders." />
              <div className="mt-3 rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-2.5">
                <p className="mb-2 text-xs font-medium text-blue-900">Inserir dado do lead</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ["nome", "Nome"], ["empresa", "Empresa"], ["segmento", "Segmento"], ["cidade", "Cidade"],
                    ["estado", "Estado"], ["cnpj", "CNPJ"], ["email", "E-mail"], ["whatsapp", "WhatsApp"],
                  ].map(([variable, label]) => <button key={variable} type="button" onClick={() => setForm({ ...form, body_template: `${form.body_template}{{${variable}}}` })} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-xs transition hover:border-blue-400 hover:bg-blue-100">{label}</button>)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>Ativa</Label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" onClick={save} disabled={saving || !form.body_template}>
                {form.id ? "Atualizar" : "Criar"}
              </Button>
              {form.id && (
                <Button className="w-full sm:w-auto" variant="outline" onClick={() => setForm(emptyForm())}>Cancelar</Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Variantes ({items.length})</CardTitle></CardHeader>
          <CardContent className="p-0 sm:p-5">
            <div className="overflow-x-auto"><table className="min-w-[42rem] w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2">D</th>
                  <th className="text-left">Canal</th>
                  <th className="text-left">Chave</th>
                  <th className="text-right">Peso</th>
                  <th className="text-right">Env</th>
                  <th className="text-right">Resp%</th>
                  <th className="text-right">Pos%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => {
                  const rr = v.sent_count ? Math.round((v.reply_count / v.sent_count) * 100) : 0;
                  const pr = v.sent_count ? Math.round((v.positive_count / v.sent_count) * 100) : 0;
                  return (
                    <tr key={v.id} className="border-b hover:bg-muted/30">
                      <td className="py-2">{v.cadence_day}</td>
                      <td>{v.channel}</td>
                      <td>
                        <span className={v.active ? "" : "text-muted-foreground line-through"}>
                          {v.variant_key}
                        </span>
                      </td>
                      <td className="text-right">{v.weight}</td>
                      <td className="text-right">{v.sent_count}</td>
                      <td className="text-right">{rr}%</td>
                      <td className="text-right">{pr}%</td>
                      <td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => edit(v)}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(v.id)}>X</Button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">Sem variantes ainda.</td></tr>
                )}
              </tbody>
            </table></div>
          </CardContent>
        </Card>
      </div>
        </TabsContent>
        <TabsContent value="results">
          <ResultsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type CadenceRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  objective: string | null;
  status: "active" | "paused" | "draft";
  is_default: boolean;
  steps?: number;
  active_leads?: number;
};

function CadencesListTab() {
  const fetchList = useServerFn(listCadences);
  const upsert = useServerFn(upsertCadence);
  const setStatus = useServerFn(setCadenceStatus);
  const dup = useServerFn(duplicateCadence);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["cadences-list"],
    queryFn: () => fetchList(),
  });
  const [editing, setEditing] = useState<Partial<CadenceRow> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing?.name) return;
    setSaving(true);
    try {
      await upsert({
        data: {
          id: editing.id,
          name: editing.name,
          description: editing.description ?? null,
          category: (editing.category as never) ?? "Personalizada",
          objective: editing.objective ?? null,
          status: (editing.status as never) ?? "active",
        } as never,
      });
      toast.success("Cadência salva");
      setEditing(null);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: "active" | "paused" | "draft") {
    try {
      await setStatus({ data: { id, status } });
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function duplicate(id: string) {
    try {
      await dup({ data: { id } });
      toast.success("Cadência duplicada");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setEditing({ name: "", category: "Personalizada", status: "active" })
          }
        >
          Nova cadência
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
          ) : (data?.items ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhuma cadência criada.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Nome</th>
                  <th className="text-left">Categoria</th>
                  <th className="text-left">Objetivo</th>
                  <th className="text-right">Passos</th>
                  <th className="text-right">Leads ativos</th>
                  <th className="text-left pl-3">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {((data?.items ?? []) as unknown as CadenceRow[]).map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium">
                      {c.name}
                      {c.is_default && (
                        <span className="ml-2 text-xs text-muted-foreground">(padrão)</span>
                      )}
                    </td>
                    <td>{c.category}</td>
                    <td className="text-muted-foreground truncate max-w-[260px]">{c.objective ?? "—"}</td>
                    <td className="text-right">{c.steps ?? 0}</td>
                    <td className="text-right">{c.active_leads ?? 0}</td>
                    <td className="pl-3">
                      <span
                        className={
                          c.status === "active"
                            ? "text-emerald-600"
                            : c.status === "paused"
                              ? "text-amber-600"
                              : "text-muted-foreground"
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="text-right pr-3 whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => duplicate(c.id)}>
                        Duplicar
                      </Button>
                      {c.status === "active" ? (
                        <Button size="sm" variant="ghost" onClick={() => changeStatus(c.id, "paused")}>
                          Pausar
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => changeStatus(c.id, "active")}>
                          Ativar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>{editing.id ? "Editar cadência" : "Nova cadência"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <select
                  className="w-full border rounded-md h-9 px-2 bg-background"
                  value={editing.category ?? "Personalizada"}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                >
                  {CADENCE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Objetivo</Label>
              <Input
                value={editing.objective ?? ""}
                onChange={(e) => setEditing({ ...editing, objective: e.target.value })}
                placeholder="Ex.: agendar reunião para serviços gerenciados de TI"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="w-full border rounded-md h-9 px-2 bg-background"
                value={editing.status ?? "active"}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as never })}
              >
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
                <option value="draft">Rascunho</option>
              </select>
            </div>
            <div className="text-xs text-muted-foreground">
              Os passos (dia/canal/variante) são editados na aba <strong>Variantes</strong>. Ao
              criar variantes, vincule-as a esta cadência usando o campo cadence_id (ou deixe sem
              vínculo para herdar a cadência padrão).
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !editing.name}>
                {editing.id ? "Atualizar" : "Criar"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultsTab() {
  const fetchKpis = useServerFn(cadenceKpis);
  const { data, isLoading } = useQuery({ queryKey: ["cadence-kpis"], queryFn: () => fetchKpis() });
  if (isLoading || !data) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  const maxSent = Math.max(1, ...data.series.map((s) => s.sent));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Enviados (30d)" value={data.sent} />
        <Kpi label="Entregues" value={data.delivered} />
        <Kpi label="Respostas" value={data.replied} sub={`${data.replyRate}%`} />
        <Kpi label="Em cadência" value={data.inCadence} sub={`${data.paused} pausados`} />
        <Kpi label="Reuniões" value={data.meetings} />
        <Kpi label="Qualificados" value={data.qualified} />
      </div>
      <Card>
        <CardHeader><CardTitle>Envios e respostas — últimos 30 dias</CardTitle></CardHeader>
        <CardContent>
          {data.series.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem atividade ainda.</p>
          ) : (
            <div className="flex items-end gap-1 h-40">
              {data.series.map((s) => (
                <div key={s.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${s.day}: ${s.sent} env / ${s.replied} resp`}>
                  <div className="w-full bg-primary/70 rounded-t" style={{ height: `${(s.sent / maxSent) * 100}%` }} />
                  <div className="w-full bg-emerald-500/70" style={{ height: `${(s.replied / maxSent) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Ranking de variantes</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2">D</th>
                <th className="text-left">Canal</th>
                <th className="text-left">Chave</th>
                <th className="text-right">Env</th>
                <th className="text-right">Resp%</th>
                <th className="text-right">Pos%</th>
              </tr>
            </thead>
            <tbody>
              {[...data.variants]
                .sort((a, b) => {
                  const ar = a.sent_count ? a.positive_count / a.sent_count : 0;
                  const br = b.sent_count ? b.positive_count / b.sent_count : 0;
                  return br - ar;
                })
                .map((v) => {
                  const rr = v.sent_count ? Math.round((v.reply_count / v.sent_count) * 100) : 0;
                  const pr = v.sent_count ? Math.round((v.positive_count / v.sent_count) * 100) : 0;
                  return (
                    <tr key={`${v.cadence_day}-${v.channel}-${v.variant_key}`} className="border-b">
                      <td className="py-2">{v.cadence_day}</td>
                      <td>{v.channel}</td>
                      <td>{v.variant_key}</td>
                      <td className="text-right">{v.sent_count}</td>
                      <td className="text-right">{rr}%</td>
                      <td className="text-right">{pr}%</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
