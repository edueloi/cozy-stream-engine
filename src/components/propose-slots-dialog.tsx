import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { proposeSlots, bookSlot } from "@/lib/scheduling.functions";

export function ProposeSlotsDialog(props: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBooked?: () => void;
  durationMin?: number;
  title?: string;
}) {
  const propose = useServerFn(proposeSlots);
  const book = useServerFn(bookSlot);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["propose-slots", props.leadId, props.durationMin, props.open],
    queryFn: () => propose({ data: { leadId: props.leadId, durationMin: props.durationMin } }) as any,
    enabled: props.open,
  });

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    try {
      const r: any = await book({ data: { leadId: props.leadId, startIso: chosen, title: props.title } });
      if (r?.ok) {
        toast.success("Reunião agendada");
        props.onOpenChange(false);
        props.onBooked?.();
      } else {
        toast.error(r?.message || "Falha ao agendar");
        if (r?.reason === "conflict") refetch();
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao agendar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Horários disponíveis</DialogTitle>
        </DialogHeader>
        {isLoading && <div className="text-sm text-muted-foreground">Consultando agenda em tempo real…</div>}
        {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}
        {data && (data as any).slots?.length === 0 && (
          <div className="text-sm text-muted-foreground">Sem horários livres nos próximos dias úteis.</div>
        )}
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-auto">
          {(data as any)?.slots?.map((s: any) => {
            const d = new Date(s.start);
            const label = d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            return (
              <button
                key={s.start}
                type="button"
                onClick={() => setChosen(s.start)}
                className={`text-left text-sm rounded-md border px-3 py-2 hover:bg-accent ${chosen === s.start ? "border-primary bg-accent" : ""}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirm} disabled={!chosen || busy}>{busy ? "Reservando…" : "Confirmar horário"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}