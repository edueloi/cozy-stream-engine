import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { deleteLead, listLeads, upsertLead } from "@/lib/leads.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads/")({ component: LeadsPage });

function LeadsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const fetchLeads = useServerFn(listLeads);
  const saveLead = useServerFn(upsertLead);
  const removeLead = useServerFn(deleteLead);
  const { data: leads = [], isLoading, refetch } = useQuery({ queryKey: ["leads", search], queryFn: () => fetchLeads({ data: { search } }) });

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const lead = await saveLead({ data: values });
      setOpen(false); refetch(); navigate({ to: "/leads/$id", params: { id: lead.id } });
    } catch (error) { toast.error((error as Error).message); }
  }

  return <div>
    <PageHeader title="Leads" description="Gerencie a sua base de prospects" action={<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-1.5 size-4" />Novo lead</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Novo lead</DialogTitle></DialogHeader><form className="space-y-3" onSubmit={createLead}><div className="grid grid-cols-2 gap-3"><Field name="razao_social" label="Razão social" /><Field name="nome_fantasia" label="Nome fantasia" /><Field name="email" label="E-mail" type="email" /><Field name="whatsapp" label="WhatsApp" /><Field name="segmento" label="Segmento" /><Field name="cidade" label="Cidade" /></div><DialogFooter><Button type="submit">Salvar lead</Button></DialogFooter></form></DialogContent></Dialog>} />
    <div className="mb-4 max-w-md"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail ou cidade" /></div></div>
    <Card><CardContent className="p-0">{isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando...</div> : leads.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">Nenhum lead cadastrado.</div> : <div className="divide-y">{leads.map((lead: any) => <div key={lead.id} className="flex items-center gap-4 p-4 hover:bg-muted/40"><Link className="min-w-0 flex-1" to="/leads/$id" params={{ id: lead.id }}><div className="truncate font-medium">{lead.nome_fantasia || lead.razao_social || "Sem nome"}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{[lead.segmento, lead.cidade, lead.email].filter(Boolean).join(" · ")}</div></Link><Badge variant="secondary">{lead.status.replace("_", " ")}</Badge><span className="w-8 text-right text-sm font-semibold">{lead.score}</span><Button size="icon" variant="ghost" onClick={async () => { await removeLead({ data: { id: lead.id } }); refetch(); }} aria-label="Excluir lead"><Trash2 className="size-4 text-destructive" /></Button></div>)}</div>}</CardContent></Card>
  </div>;
}

function Field({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} /></div>;
}
