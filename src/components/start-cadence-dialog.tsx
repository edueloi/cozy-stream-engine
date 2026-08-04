import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCadences, startCadenceForLeads } from "@/lib/cadences.functions";
import { listAgents } from "@/lib/agents.functions";

type Props = {
  leadIds: string[];
  trigger: React.ReactNode;
  onDone?: () => void;
};

export function StartCadenceDialog({ leadIds, trigger, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [cadenceId, setCadenceId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>("keep");
  const [busy, setBusy] = useState(false);
  const fetchCadences = useServerFn(listCadences);
  const fetchAgents = useServerFn(listAgents);
  const startFn = useServerFn(startCadenceForLeads);
  const { data: cadences } = useQuery({
    queryKey: ["cadences-for-start"],
    queryFn: () => fetchCadences(),
    enabled: open,
  });
  const { data: agents } = useQuery({
    queryKey: ["agents-for-start"],
    queryFn: () => fetchAgents(),
    enabled: open,
  });

  async function run(forceReplace = false) {
    if (!cadenceId || leadIds.length === 0) return;
    setBusy(true);
    try {
      const r = await startFn({
        data: {
          leadIds,
          cadenceId,
          agentId: agentId === "keep" ? undefined : agentId === "none" ? null : agentId,
          forceReplace,
        },
      });
      if ((r as any).needsConfirmation) {
        if (
          confirm(
            `${(r as any).conflicting} lead(s) já possuem uma cadência ativa diferente. Pausar a atual e iniciar a nova?`,
          )
        ) {
          await run(true);
        }
        return;
      }
      const sent = (r as any).sent ?? 0;
      const failed = (r as any).failed ?? 0;
      if (sent > 0) toast.success(`${sent} mensagem(ns) enviada(s)`);
      if (failed > 0) toast.error(`${failed} falha(s): ${((r as any).errors ?? []).join("; ")}`);
      if (sent === 0 && failed === 0) toast.success(`Cadência iniciada para ${leadIds.length} lead(s)`);
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar cadência</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {leadIds.length} lead(s) selecionado(s).
          </div>
          <div className="space-y-1.5">
            <Label>Cadência</Label>
            <Select value={cadenceId} onValueChange={setCadenceId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a cadência..." />
              </SelectTrigger>
              <SelectContent>
                {(cadences?.items ?? [])
                  .filter((c: any) => c.status !== "draft")
                  .map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.category ? `· ${c.category}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Agente responsável</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Manter agente atual</SelectItem>
                <SelectItem value="none">Sem agente</SelectItem>
                {(agents?.items ?? []).map((a: { id: string; name: string }) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => run(false)} disabled={!cadenceId || busy}>
            {busy ? "Iniciando..." : "Iniciar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}