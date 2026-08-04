import { createFileRoute } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listProducts,
  upsertProduct,
  duplicateProduct,
  toggleProductStatus,
  deleteProduct,
  getUniversalIcpFlag,
  setUniversalIcpFlag,
} from "@/lib/products.functions";
import { listIcps } from "@/lib/icp.functions";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

function ProductsPage() {
  return (
    <div className="w-full">
        <PageHeader
          title="Produtos"
          description="Cadastre os produtos ou serviços que você vende. Cada produto pode usar um ICP para classificar automaticamente prospects."
        />
        <FlagToggle />
        <ProductList />
    </div>
  );
}

function FlagToggle() {
  const getFlag = useServerFn(getUniversalIcpFlag);
  const setFlag = useServerFn(setUniversalIcpFlag);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["universal-icp-flag"], queryFn: () => getFlag() });
  const mut = useMutation({
    mutationFn: (enabled: boolean) => setFlag({ data: { enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["universal-icp-flag"] });
      toast.success("Configuração salva");
    },
  });
  return (
    <Card className="mb-4">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="font-medium">Motor Universal de ICP</div>
          <div className="text-sm text-muted-foreground">
            Ativa a classificação automática de resultados de prospecção por produto/ICP.
          </div>
        </div>
        <Switch checked={data?.enabled ?? false} onCheckedChange={(v) => mut.mutate(v)} />
      </CardContent>
    </Card>
  );
}

function ProductList() {
  const list = useServerFn(listProducts);
  const listIcpsFn = useServerFn(listIcps);
  const del = useServerFn(deleteProduct);
  const toggle = useServerFn(toggleProductStatus);
  const dup = useServerFn(duplicateProduct);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["products"], queryFn: () => list() });
  const { data: icpData } = useQuery({ queryKey: ["icps"], queryFn: () => listIcpsFn() });
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["products"] });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>+ Novo produto</Button>
      </div>
      {(data?.items ?? []).map((p: any) => {
        const icp = (icpData?.items ?? []).find((i: any) => i.id === p.icp_id);
        return (
          <Card key={p.id}>
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.nome}</span>
                  {p.produto_padrao && <Badge variant="secondary">Padrão</Badge>}
                  <Badge variant={p.status === "active" ? "default" : "outline"}>
                    {p.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {p.descricao || "Sem descrição"} · ICP: {icp?.name || <em>não vinculado</em>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={p.status === "active"}
                  onCheckedChange={async (v) => {
                    await toggle({ data: { id: p.id, status: v ? "active" : "inactive" } });
                    refresh();
                  }}
                />
                <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true); }}>Editar</Button>
                <Button variant="ghost" size="sm" onClick={async () => { await dup({ data: { id: p.id } }); refresh(); toast.success("Duplicado"); }}>Duplicar</Button>
                <Button variant="ghost" size="sm" onClick={async () => {
                  if (!confirm(`Excluir "${p.nome}"?`)) return;
                  await del({ data: { id: p.id } });
                  refresh();
                  toast.success("Excluído");
                }}>Excluir</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        icps={icpData?.items ?? []}
        onSaved={() => { setOpen(false); refresh(); }}
      />
    </div>
  );
}

function ProductDialog({
  open, onOpenChange, product, icps, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: any | null;
  icps: any[];
  onSaved: () => void;
}) {
  const save = useServerFn(upsertProduct);
  const [nome, setNome] = useState(product?.nome ?? "");
  const [descricao, setDescricao] = useState(product?.descricao ?? "");
  const [icpId, setIcpId] = useState<string | undefined>(product?.icp_id ?? undefined);
  const [padrao, setPadrao] = useState<boolean>(product?.produto_padrao ?? false);

  // reset form when reopening
  if (open && product && nome === "" && descricao === "" && !icpId && !padrao) {
    setNome(product.nome ?? "");
    setDescricao(product.descricao ?? "");
    setIcpId(product.icp_id ?? undefined);
    setPadrao(product.produto_padrao ?? false);
  }

  const mut = useMutation({
    mutationFn: () => save({ data: {
      id: product?.id,
      nome,
      descricao: descricao || null,
      icp_id: icpId ?? null,
      produto_padrao: padrao,
      status: product?.status ?? "active",
      ordem: product?.ordem ?? 0,
      icone: product?.icone ?? null,
      cor: product?.cor ?? null,
    } }),
    onSuccess: () => { toast.success("Salvo"); onSaved(); resetForm(); },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  function resetForm() {
    setNome(""); setDescricao(""); setIcpId(undefined); setPadrao(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div>
            <Label>ICP vinculado</Label>
            <Select value={icpId ?? "none"} onValueChange={(v) => setIcpId(v === "none" ? undefined : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— sem ICP —</SelectItem>
                {icps.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Produto padrão da organização</Label>
            <Switch checked={padrao} onCheckedChange={setPadrao} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!nome || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}