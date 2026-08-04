import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarPlus, ExternalLink, Trash2, RefreshCcw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { listLeadMeetings, cancelMeeting, markMeetingOutcome } from "@/lib/scheduling.functions";
import { ProposeSlotsDialog } from "./propose-slots-dialog";

function statusBadge(s: string) {
  const map: Record<string, string> = {
    scheduled: "default",
    completed: "secondary",
    cancelled: "outline",
    no_show: "destructive",
    rescheduled: "outline",
  };
  const labels: Record<string, string> = {
    scheduled: "Agendada",
    completed: "Realizada",
    cancelled: "Cancelada",
    no_show: "No-show",
    rescheduled: "Reagendada",
  };
  return <Badge variant={(map[s] as any) || "default"}>{labels[s] || s}</Badge>;
}

export function LeadCalendarCard({ leadId }: { leadId: string }) {
  const list = useServerFn(listLeadMeetings);
  const cancel = useServerFn(cancelMeeting);
  const outcome = useServerFn(markMeetingOutcome);
  const [open, setOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["lead-meetings", leadId],
    queryFn: () => list({ data: { leadId } }) as any,
  });

  async function doCancel(id: string) {
    if (!confirm("Cancelar esta reunião?")) return;
    try {
      await cancel({ data: { meetingId: id } });
      toast.success("Reunião cancelada");
      refetch();
    } catch (e: any) { toast.error(e?.message || "Falha ao cancelar"); }
  }
  async function setOutcome(id: string, o: "happened" | "no_show") {
    try {
      await outcome({ data: { meetingId: id, outcome: o } });
      toast.success("Atualizado");
      refetch();
    } catch (e: any) { toast.error(e?.message || "Falha"); }
  }

  const rows = (data ?? []) as any[];
  const now = Date.now();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Agenda</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <CalendarPlus className="h-4 w-4 mr-1" /> Agendar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">Sem reuniões.</div>}
        {rows.map((m) => {
          const past = new Date(m.start_at).getTime() < now;
          return (
            <div key={m.id} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {new Date(m.start_at).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {statusBadge(m.status)}
                  <Badge variant="outline" className="uppercase text-[10px]">{m.provider}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{m.title}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {m.meeting_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={m.meeting_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />{m.provider === "google" ? "Meet" : "Teams"}
                    </a>
                  </Button>
                )}
                {m.status === "scheduled" && past && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setOutcome(m.id, "happened")}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Realizada
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setOutcome(m.id, "no_show")}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> No-show
                    </Button>
                  </>
                )}
                {m.status === "scheduled" && !past && (
                  <Button size="sm" variant="ghost" onClick={() => doCancel(m.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
      <ProposeSlotsDialog leadId={leadId} open={open} onOpenChange={(v) => { setOpen(v); if (!v) refetch(); }} onBooked={() => refetch()} />
      {/* reschedule dialog reuses propose for simplicity in future */}
      {rescheduleOpen && null}
    </Card>
  );
}