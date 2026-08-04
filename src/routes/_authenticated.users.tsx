import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createUser,
  deleteUser,
  getMyRoles,
  listUsers,
  updateUser,
  updateUserRole,
} from "@/lib/users.functions";
import { listOrgCalendarStatus, requestCalendarConnection } from "@/lib/calendar.functions";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  gerente: "Gerente de Vendas",
  sdr: "Vendedor",
  comercial: "Vendedor",
};

function UsersPage() {
  const qc = useQueryClient();
  const fetchMe = useServerFn(getMyRoles);
  const fetchUsers = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const updRole = useServerFn(updateUserRole);
  const updUser = useServerFn(updateUser);
  const delUser = useServerFn(deleteUser);
  const calStatusFn = useServerFn(listOrgCalendarStatus);
  const requestConnFn = useServerFn(requestCalendarConnection);

  const me = useQuery({ queryKey: ["me-roles"], queryFn: () => fetchMe() });
  const users = useQuery({
    queryKey: ["users", me.data?.userId],
    queryFn: () => fetchUsers(),
    enabled: !!me.data?.userId,
  });
  const calStatus = useQuery({
    queryKey: ["org-calendar-status", me.data?.userId],
    queryFn: () => calStatusFn(),
    enabled: !!me.data?.userId,
  });

  const statusByUser = new Map<string, { provider: string | null; connected: boolean; external_email: string | null }>();
  for (const s of calStatus.data ?? []) {
    statusByUser.set(s.user_id, { provider: s.provider, connected: s.connected, external_email: s.external_email });
  }

  const isSuper = me.data?.roles.includes("superadmin");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "sdr" as "admin" | "gerente" | "sdr",
  });
  const [editing, setEditing] = useState<null | {
    userId: string;
    name: string;
    email: string;
    password: string;
    role: "superadmin" | "admin" | "gerente" | "sdr";
  }>(null);

  const createMut = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => {
      toast.success("Usuário criado.");
      setForm({ name: "", email: "", password: "", role: "sdr" });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; role: "superadmin" | "admin" | "gerente" | "sdr" }) =>
      updRole({ data: v }),
    onSuccess: () => {
      toast.success("Perfil atualizado.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (userId: string) => delUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário removido.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Nenhum usuário selecionado.");
      return updUser({
        data: {
          userId: editing.userId,
          name: editing.name,
          email: editing.email,
          password: editing.password || undefined,
          role: editing.userId === me.data?.userId ? undefined : editing.role,
        },
      });
    },
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="w-full">
      <PageHeader
        title="Usuários"
        description="Gerencie gestores e vendedores. Cada vendedor enxerga apenas seus próprios leads."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Criar usuário</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Senha (mín. 8)</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div>
            <Label>Perfil</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v as "admin" | "gerente" | "sdr" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sdr">Vendedor</SelectItem>
                <SelectItem value="gerente">Gerente de Vendas</SelectItem>
                {isSuper && <SelectItem value="admin">Admin</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? "Criando..." : "Criar usuário"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Agenda</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users.data ?? []).map((u) => {
                const isSelf = u.id === me.data?.userId;
                const primaryRole = u.roles[0] ?? "sdr";
                const cal = statusByUser.get(u.id);
                return (
                  <TableRow key={u.id}>
                    <TableCell>{u.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {isSelf ? (
                        <Badge variant="secondary">{ROLE_LABEL[primaryRole] ?? primaryRole}</Badge>
                      ) : (
                        <Select
                          value={
                            ["superadmin", "gerente", "sdr"].includes(primaryRole)
                              ? primaryRole
                              : primaryRole === "admin"
                                ? "admin"
                                : "sdr"
                          }
                          onValueChange={(v) =>
                            roleMut.mutate({
                              userId: u.id,
                              role: v as "superadmin" | "admin" | "gerente" | "sdr",
                            })
                          }
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sdr">Vendedor</SelectItem>
                            <SelectItem value="gerente">Gerente de Vendas</SelectItem>
                            {isSuper && <SelectItem value="admin">Admin</SelectItem>}
                            {isSuper && <SelectItem value="superadmin">Superadmin</SelectItem>}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {cal?.connected ? (
                        <Badge variant="secondary" title={cal.external_email ?? undefined}>
                          {cal.provider === "google" ? "Google" : cal.provider === "microsoft" ? "Microsoft" : "Conectada"}
                        </Badge>
                      ) : isSelf ? (
                        <a href="/my-calendar" className="text-xs underline text-muted-foreground">Conectar</a>
                      ) : (
                        <span className="text-xs text-muted-foreground">Não conectada</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!isSelf && !cal?.connected && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await requestConnFn({ data: { userId: u.id } });
                                toast.success("Solicitação registrada.");
                              } catch (e) { toast.error((e as Error).message); }
                            }}
                          >
                            Solicitar conexão
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditing({
                              userId: u.id,
                              name: u.name ?? "",
                              email: u.email ?? "",
                              password: "",
                              role: ["superadmin", "admin", "gerente", "sdr"].includes(primaryRole)
                                ? (primaryRole as "superadmin" | "admin" | "gerente" | "sdr")
                                : "sdr",
                            })
                          }
                        >
                          <Pencil className="size-3.5 mr-1.5" />
                          Editar
                        </Button>
                        {!isSelf && isSuper && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm(`Remover ${u.email}?`)) delMut.mutate(u.id);
                            }}
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {users.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Carregando...
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
            <DialogTitle>Editar usuário</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  value={editing.password}
                  placeholder="Deixe em branco para manter"
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select
                  value={editing.role}
                  onValueChange={(v) => setEditing({ ...editing, role: v as typeof editing.role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sdr">Vendedor</SelectItem>
                    <SelectItem value="gerente">Gerente de Vendas</SelectItem>
                    {isSuper && <SelectItem value="admin">Admin</SelectItem>}
                    {isSuper && <SelectItem value="superadmin">Superadmin</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => editMut.mutate()} disabled={editMut.isPending}>
              {editMut.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
