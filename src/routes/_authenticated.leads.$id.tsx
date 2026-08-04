import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteLead, getLead, updateLeadStatus, upsertLead } from "@/lib/leads.functions";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({ meta: [{ title: "Lead — JCS SDR" }] }),
  component: LeadDetail,
});

const statuses = ["coletado", "enriquecido", "em_cadencia", "qualificado", "reuniao", "convertido", "descartado"];

function LeadDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const fetchLead = useServerFn(getLead);
  const saveLead = useServerFn(upsertLead);
  const removeLead = useServerFn(deleteLead);
  const changeStatus = useServerFn(updateLeadStatus);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => fetchLead({ data: { id } }),
  });
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data?.lead) return;
    const lead = data.lead;
    setForm({
      razao_social: lead.razao_social ?? "", nome_fantasia: lead.nome_fantasia ?? "", cnpj: lead.cnpj ?? "",
      segmento: lead.segmento ?? "", cidade: lead.cidade ?? "", estado: lead.estado ?? "", site: lead.site ?? "",
      email: lead.email ?? "", whatsapp: lead.whatsapp ?? "", telefone: lead.telefone ?? "", notes: lead.notes ?? "",
    });
  }, [data]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando lead...</div>;
  if (!data?.lead) return <div className="p-6">Lead não encontrado.</div>;
  const lead = data.lead;

  async function handleSave() {
    try {
      await saveLead({ data: { id, ...form } });
      toast.success("Dados salvos.");
      refetch();
    } catch (error) { toast.error((error as Error).message); }
  }
  async function handleDelete() {
    if (!window.confirm("Excluir este lead?")) return;
    await removeLead({ data: { id } });
    toast.success("Lead excluído.");
    navigate({ to: "/leads" });
  }
  async function handleStatus(status: string) {
    await changeStatus({ data: { id, status } });
    toast.success("Status atualizado.");
    refetch();
  }

  return <div className="w-full">
    <PageHeader
      title={lead.nome_fantasia || lead.razao_social || "Lead"}
      description={[lead.segmento, lead.cidade, lead.estado].filter(Boolean).join(" · ") || "Cadastro local"}
      action={<div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Score {Number(lead.score || 0)}</Badge>
        <Select value={lead.status} onValueChange={handleStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={handleDelete}>Excluir</Button>
      </div>}
    />
    <Card className="max-w-5xl">
      <CardHeader><CardTitle>Dados do lead</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[["razao_social", "Razão social"], ["nome_fantasia", "Nome fantasia"], ["cnpj", "CNPJ"], ["segmento", "Segmento"], ["cidade", "Cidade"], ["estado", "Estado"], ["site", "Site"], ["email", "E-mail"], ["whatsapp", "WhatsApp"], ["telefone", "Telefone"]].map(([key, label]) => <div key={key} className="space-y-1.5">
            <Label htmlFor={key}>{label}</Label>
            <Input id={key} value={form[key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
          </div>)}
        </div>
        <div className="space-y-1.5"><Label htmlFor="notes">Notas</Label><Textarea id="notes" rows={5} value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
        <Button onClick={handleSave}>Salvar alterações</Button>
      </CardContent>
    </Card>
  </div>;
}
