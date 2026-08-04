import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, ExternalLink, MapPin, RefreshCcw, Trash2, Video } from "lucide-react";
import { listMyCalendarEvents, deleteMyCalendarEvent, listOrgCalendarUsers } from "@/lib/calendar.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Range = 7 | 14 | 30;

export function CalendarMirror() {
  const listFn = useServerFn(listMyCalendarEvents);
  const delFn = useServerFn(deleteMyCalendarEvent);
  const usersFn = useServerFn(listOrgCalendarUsers);
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>(14);
  const [selectedUser, setSelectedUser] = useState<string>("me");

  const usersQ = useQuery({
    queryKey: ["org-calendar-users"],
    queryFn: () => usersFn(),
  });
  const users = usersQ.data ?? [];

  const q = useQuery({
    queryKey: ["calendar-mirror", range, selectedUser],
    queryFn: () =>
      listFn({
        data: {
          daysAhead: range,
          ...(selectedUser !== "me" ? { userId: selectedUser } : {}),
        },
      }),
  });

  const del = useMutation({
    mutationFn: async (eventId: string) => delFn({ data: { eventId } }),
    onSuccess: () => {
      toast.success("Evento excluído");
      qc.invalidateQueries({ queryKey: ["calendar-mirror"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const grouped = useMemo(() => {
    const events = q.data?.events ?? [];
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const d = new Date(e.start);
      const key = isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [q.data]);

  const notConnected = q.data && !q.data.provider;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="size-4" /> Espelho da Agenda
        </CardTitle>
        <div className="flex items-center gap-2">
          {users.length > 0 && (
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Agenda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Minha agenda</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.name || u.email || u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {(["7", "14", "30"] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === Number(r) ? "default" : "outline"}
              onClick={() => setRange(Number(r) as Range)}
            >
              {r}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCcw className={"size-3.5 " + (q.isFetching ? "animate-spin" : "")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : q.isError ? (
          <div className="text-sm text-destructive">Falha: {(q.error as Error).message}</div>
        ) : notConnected ? (
          <div className="text-sm text-muted-foreground">
            Conecte sua agenda acima para ver os próximos compromissos.
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum compromisso nos próximos {range} dias.</div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <div className="text-xs font-bold uppercase text-foreground mb-2 tracking-wide">
                  {formatDay(day)}
                </div>
                <div className="space-y-2">
                  {items.map((e) => (
                    <div key={e.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {e.allDay ? "Dia inteiro" : `${formatTime(e.start)} – ${formatTime(e.end)}`}
                          {q.data?.provider ? (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              {q.data.provider === "google" ? "Google" : "Microsoft"}
                            </Badge>
                          ) : null}
                        </div>
                        {e.location && (
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <MapPin className="size-3" /> {e.location}
                          </div>
                        )}
                        {e.meetingUrl && (
                          <a className="text-xs text-primary inline-flex items-center gap-1 mt-1" href={e.meetingUrl} target="_blank" rel="noreferrer">
                            <Video className="size-3" /> Link da reunião
                          </a>
                        )}
                        {(e.attendees ?? []).length > 0 && (
                          <div className="text-[11px] text-muted-foreground mt-1 truncate">
                            {(e.attendees ?? []).map((a) => a.name || a.email).filter(Boolean).join(", ")}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {e.htmlLink && (
                          <a href={e.htmlLink} target="_blank" rel="noreferrer">
                            <Button size="icon" variant="ghost" title="Abrir no calendário">
                              <ExternalLink className="size-4" />
                            </Button>
                          </a>
                        )}
                        {selectedUser === "me" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir evento"
                          onClick={() => {
                            if (!confirm(`Excluir "${e.title}"? Isso remove o evento da sua agenda.`)) return;
                            del.mutate(e.id);
                          }}
                          disabled={del.isPending}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatDay(iso: string) {
  if (iso === "—") return "Sem data";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function formatTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}