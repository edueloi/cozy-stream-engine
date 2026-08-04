import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dashboardSummary, listMyMeetings } from "@/lib/scheduling.functions";

type Range = "today" | "7d" | "30d";

function rangeIso(r: Range) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (r === "today") end.setDate(end.getDate() + 1);
  if (r === "7d") end.setDate(end.getDate() + 7);
  if (r === "30d") end.setDate(end.getDate() + 30);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

export function CalendarDashboardSummary() {
  const sumFn = useServerFn(dashboardSummary);
  const listFn = useServerFn(listMyMeetings);
  const [range, setRange] = useState<Range>("7d");
  const r = useMemo(() => rangeIso(range), [range]);
  const { data: sum } = useQuery({ queryKey: ["meet-sum", range], queryFn: () => sumFn({ data: r }) as any });
  const { data: list } = useQuery({ queryKey: ["meet-list", range], queryFn: () => listFn({ data: r }) as any });
  const s = (sum ?? {}) as any;
  const items = (list ?? []) as any[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Painel de Reuniões</CardTitle>
        <div className="flex gap-1">
          {(["today", "7d", "30d"] as Range[]).map((k) => (
            <Button key={k} size="sm" variant={range === k ? "default" : "outline"} onClick={() => setRange(k)}>
              {k === "today" ? "Hoje" : k === "7d" ? "7 dias" : "30 dias"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Agendadas" value={s.scheduled ?? 0} />
          <Kpi label="Realizadas" value={s.happened ?? 0} />
          <Kpi label="Canceladas" value={s.cancelled ?? 0} />
          <Kpi label="No-show" value={s.noShow ?? 0} />
          <Kpi label="Comparecimento" value={s.attendanceRate != null ? `${s.attendanceRate}%` : "—"} />
        </div>
        <div className="text-xs text-muted-foreground">Tempo ocupado no período: {Math.round((s.busyMin ?? 0) / 60)}h {(s.busyMin ?? 0) % 60}min</div>
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {items.length === 0 && <div className="text-sm text-muted-foreground">Sem reuniões neste período.</div>}
          {items.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm border rounded-md px-2 py-1.5">
              <div className="truncate">
                <span className="font-medium">{new Date(m.start_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-muted-foreground"> · {m.title || "Reunião"}</span>
              </div>
              <Badge variant="outline" className="uppercase text-[10px]">{m.provider}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}