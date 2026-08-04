import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listOrganizations,
  listPlans,
  createOrganization,
  saasGlobalKpis,
  usagePerOrg,
  updateOrganization,
  deleteOrganization,
} from "@/lib/saas-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/app-shell";
import { Building2, Users, MessageSquare, PhoneCall, Bot, DollarSign } from "lucide-react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/saas")({
  head: () => ({ meta: [{ title: "Admin SaaS — JCS SDR" }] }),
  component: SaasAdminPage,
});

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <div className="size-10 rounded-md bg-muted flex items-center justify-center">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

function SaasAdminPage() {
  const fetchKpis = useServerFn(saasGlobalKpis);
  const fetchOrgs = useServerFn(listOrganizations);
  const fetchUsage = useServerFn(usagePerOrg);
  const fetchPlans = useServerFn(listPlans);
  const createOrg = useServerFn(createOrganization);
  const updateOrg = useServerFn(updateOrganization);
  const deleteOrg = useServerFn(deleteOrganization);
  const qc = useQueryClient();

  const kpis = useQuery({ queryKey: ["saas-kpis"], queryFn: () => fetchKpis() });
  const orgs = useQuery({ queryKey: ["saas-orgs"], queryFn: () => fetchOrgs() });
  const usage = useQuery({ queryKey: ["saas-usage"], queryFn: () => fetchUsage() });
  const plans = useQuery({ queryKey: ["saas-plans"], queryFn: () => fetchPlans() });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("starter");
  const [status, setStatus] = useState("trial");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const createMut = useMutation({
    mutationFn: () => {
      const admin =
        adminEmail && adminPassword
          ? { name: adminName || adminEmail, email: adminEmail, password: adminPassword }
          : undefined;
      return createOrg({ data: { name, slug, plan, status, admin } });
    },
    onSuccess: () => {
      toast.success(adminEmail ? "Organização e admin criados" : "Organização criada");
      setName("");
      setSlug("");
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      qc.invalidateQueries({ queryKey: ["saas-orgs"] });
      qc.invalidateQueries({ queryKey: ["saas-kpis"] });
      qc.invalidateQueries({ queryKey: ["saas-usage"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao criar organização"),
  });

  const [editing, setEditing] = useState<null | {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  }>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["saas-orgs"] });
    qc.invalidateQueries({ queryKey: ["saas-kpis"] });
    qc.invalidateQueries({ queryKey: ["saas-usage"] });
  };

  const editMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Nada para salvar");
      return updateOrg({
        data: {
          id: editing.id,
          name: editing.name,
          slug: editing.slug,
          plan: editing.plan,
          status: editing.status,
        },
      });
    },
    onSuccess: () => {
      toast.success("Organização atualizada");
      setEditing(null);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao atualizar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOrg({ data: { id } }),
    onSuccess: () => {
      toast.success("Organização removida");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  const k = kpis.data;
  const mrr = k ? (k.mrrCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administração SaaS"
        description="Visão global da plataforma multiempresa"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total de clientes" value={k?.totalClientes ?? "—"} icon={Building2} />
        <Kpi label="Ativos" value={k?.ativos ?? "—"} icon={Building2} />
        <Kpi label="Em trial" value={k?.trial ?? "—"} icon={Building2} />
        <Kpi label="MRR estimado" value={mrr} icon={DollarSign} />
        <Kpi label="Leads totais" value={k?.leads ?? "—"} icon={Users} />
        <Kpi label="Mensagens (30d)" value={k?.mensagens30d ?? "—"} icon={MessageSquare} />
        <Kpi label="Chamadas (30d)" value={k?.chamadas30d ?? "—"} icon={PhoneCall} />
        <Kpi label="Agentes IA" value={k?.agentes ?? "—"} icon={Bot} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova organização</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Ltda" />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="acme" />
          </div>
          <div>
            <Label>Plano</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(plans.data ?? []).map((p: any) => (
                  <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="suspended">Suspenso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!name || !slug || createMut.isPending}
          >
            {createMut.isPending ? "Criando..." : "Criar"}
          </Button>
          </div>
          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-1">Usuário Admin da organização (opcional)</div>
            <p className="text-xs text-muted-foreground mb-3">
              Crie um admin inicial para que a empresa acesse o painel. O admin pode então cadastrar gerentes e vendedores. Admins não têm acesso a outras organizações.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Nome do admin</Label>
                <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="João Silva" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@acme.com" />
              </div>
              <div>
                <Label>Senha (mín. 8)</Label>
                <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizações</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Usuários</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Msgs 30d</TableHead>
                <TableHead className="text-right">Chamadas 30d</TableHead>
                <TableHead className="text-right">Agentes</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usage.data ?? orgs.data ?? []).map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.slug}</TableCell>
                  <TableCell><Badge variant="secondary">{o.plan}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={o.status === "active" ? "default" : o.status === "trial" ? "secondary" : "destructive"}>
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{o.usuarios ?? "—"}</TableCell>
                  <TableCell className="text-right">{o.leads ?? "—"}</TableCell>
                  <TableCell className="text-right">{o.mensagens30d ?? "—"}</TableCell>
                  <TableCell className="text-right">{o.chamadas30d ?? "—"}</TableCell>
                  <TableCell className="text-right">{o.agentes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            id: o.id,
                            name: o.name ?? "",
                            slug: o.slug ?? "",
                            plan: o.plan ?? "starter",
                            status: o.status ?? "trial",
                          })
                        }
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `Remover "${o.name}"? Isso excluirá usuários, assinatura e dados vinculados.`,
                            )
                          )
                            deleteMut.mutate(o.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(usage.data ?? orgs.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Nenhuma organização ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar organização</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={editing.slug}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase() })}
                />
              </div>
              <div>
                <Label>Plano</Label>
                <Select value={editing.plan} onValueChange={(v) => setEditing({ ...editing, plan: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(plans.data ?? []).map((p: any) => (
                      <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => editMut.mutate()} disabled={editMut.isPending}>
              {editMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}