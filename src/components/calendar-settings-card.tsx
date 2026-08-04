import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listCalendarConnections,
  startCalendarOAuth,
  disconnectCalendar,
  updateCalendarPrefs,
} from "@/lib/calendar.functions";

type Props = Record<string, never>;

export function CalendarSettingsCard(_props: Props = {} as Props) {
  const startFn = useServerFn(startCalendarOAuth);
  const listFn = useServerFn(listCalendarConnections);
  const disconnectFn = useServerFn(disconnectCalendar);
  const prefsFn = useServerFn(updateCalendarPrefs);

  const conns = useQuery({
    queryKey: ["calendar-connections"],
    queryFn: () => listFn(),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("calendar");
    if (status === "success") {
      toast.success("Agenda conectada");
      conns.refetch();
    } else if (status === "error") {
      toast.error(params.get("msg") || "Falha ao conectar agenda");
    }
    if (status) {
      params.delete("calendar");
      params.delete("msg");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, [conns]);

  async function connect(provider: "google" | "microsoft") {
    try {
      const r = await startFn({ data: { provider } });
      window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function disconnect(provider: "google" | "microsoft") {
    if (!confirm("Desconectar agenda?")) return;
    try {
      await disconnectFn({ data: { provider } });
      toast.success("Desconectado");
      conns.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const google = conns.data?.find((c) => c.provider === "google");
  const microsoft = conns.data?.find((c) => c.provider === "microsoft");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Minha Agenda</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Conecte sua agenda pessoal para o agente conseguir agendar reuniões automaticamente.
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <ConnectionRow
              name="Google Calendar"
              connected={!!google}
              email={google?.email ?? null}
              onConnect={() => connect("google")}
              onDisconnect={() => disconnect("google")}
            />
            <ConnectionRow
              name="Microsoft 365"
              connected={!!microsoft}
              email={microsoft?.email ?? null}
              onConnect={() => connect("microsoft")}
              onDisconnect={() => disconnect("microsoft")}
            />
          </div>

          {(google || microsoft) && (
            <PrefsBlock
              conn={normalizeConn(google || microsoft!)}
              onSave={async (patch) => {
                try {
                  await prefsFn({ data: { provider: (google ? "google" : "microsoft"), ...patch } });
                  toast.success("Preferências salvas");
                  conns.refetch();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function normalizeConn(c: { timezone: string; default_duration_min: number; working_hours: unknown }) {
  const wh = (c.working_hours && typeof c.working_hours === "object")
    ? (c.working_hours as { days?: number[]; start?: string; end?: string })
    : {};
  return {
    timezone: c.timezone,
    default_duration_min: c.default_duration_min,
    working_hours: {
      days: wh.days ?? [1, 2, 3, 4, 5],
      start: wh.start ?? "09:00",
      end: wh.end ?? "18:00",
    },
  };
}

function ConnectionRow(props: { name: string; connected: boolean; email: string | null; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <div className="border rounded-lg p-3 flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">{props.name}</div>
        <div className="text-xs text-muted-foreground">
          {props.connected ? (props.email ?? "conectado") : "não conectado"}
        </div>
      </div>
      {props.connected ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">conectado</Badge>
          <Button size="sm" variant="outline" onClick={props.onDisconnect}>Desconectar</Button>
        </div>
      ) : (
        <Button size="sm" onClick={props.onConnect}>Conectar</Button>
      )}
    </div>
  );
}

function PrefsBlock({ conn, onSave }: { conn: { timezone: string; default_duration_min: number; working_hours: { days: number[]; start: string; end: string } }; onSave: (p: { timezone?: string; default_duration_min?: number; working_hours?: { days: number[]; start: string; end: string } }) => void }) {
  const [tz, setTz] = useState(conn.timezone);
  const [dur, setDur] = useState(String(conn.default_duration_min));
  const [start, setStart] = useState(conn.working_hours.start);
  const [end, setEnd] = useState(conn.working_hours.end);
  const [days, setDays] = useState<number[]>(conn.working_hours.days);
  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="text-sm font-medium">Disponibilidade</div>
      <div className="grid sm:grid-cols-4 gap-3">
        <Labeled label="Fuso horário"><Input value={tz} onChange={(e) => setTz(e.target.value)} /></Labeled>
        <Labeled label="Duração padrão (min)"><Input value={dur} onChange={(e) => setDur(e.target.value)} /></Labeled>
        <Labeled label="Início"><Input value={start} onChange={(e) => setStart(e.target.value)} placeholder="09:00" /></Labeled>
        <Labeled label="Fim"><Input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="18:00" /></Labeled>
      </div>
      <div className="flex flex-wrap gap-2">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((lbl, idx) => (
          <button
            type="button"
            key={lbl}
            onClick={() => setDays((d) => (d.includes(idx) ? d.filter((x) => x !== idx) : [...d, idx].sort()))}
            className={`px-2 py-1 rounded border text-xs ${days.includes(idx) ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {lbl}
          </button>
        ))}
      </div>
      <Button size="sm" onClick={() => onSave({ timezone: tz, default_duration_min: Number(dur) || 30, working_hours: { days, start, end } })}>
        Salvar disponibilidade
      </Button>
    </div>
  );
}