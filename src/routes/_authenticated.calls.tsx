import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Phone, PhoneCall, Wifi, WifiOff, Loader2 } from "lucide-react";
import { useSip } from "@/lib/sip-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoiceAiPanel } from "@/components/voice-ai-panel";

export const Route = createFileRoute("/_authenticated/calls")({
  head: () => ({ meta: [{ title: "Chamadas — JCS SDR" }] }),
  component: CallsPage,
});

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    ringing: { label: "Chamando", variant: "secondary" },
    answered: { label: "Atendida", variant: "default" },
    ended: { label: "Encerrada", variant: "outline" },
    busy: { label: "Ocupado", variant: "destructive" },
    no_answer: { label: "Sem resposta", variant: "destructive" },
    canceled: { label: "Cancelada", variant: "outline" },
    failed: { label: "Falhou", variant: "destructive" },
  };
  const cfg = map[status ?? ""] ?? { label: status ?? "—", variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function fmtDur(s: number | null) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function CallsPage() {
  const sip = useSip();
  const [number, setNumber] = useState("");

  const history = useQuery({ queryKey: ["calls-history"], queryFn: async () => [] as any[], staleTime: Infinity });

  const regLabel: Record<typeof sip.regStatus, string> = {
    unconfigured: "SIP não configurado",
    disconnected: "Desconectado",
    connecting: "Conectando…",
    registered: "Registrado",
    failed: "Falha no registro",
  };

  async function handleCall() {
    try {
      await sip.call(number);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Chamadas"
        description="Disque por SIP/VoIP e acompanhe o histórico de ligações."
        action={
          <div className="flex items-center gap-2 text-sm">
            {sip.regStatus === "registered" ? (
              <Wifi className="size-4 text-emerald-500" />
            ) : (
              <WifiOff className="size-4 text-muted-foreground" />
            )}
            <span className="text-muted-foreground">{regLabel[sip.regStatus]}</span>
            {sip.regStatus === "failed" && sip.regError && (
              <span className="text-destructive">— {sip.regError}</span>
            )}
          </div>
        }
      />

      <Tabs defaultValue="human" className="space-y-5">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="human">Humana (SIP)</TabsTrigger>
          <TabsTrigger value="ai">IA de voz</TabsTrigger>
        </TabsList>
        <TabsContent value="human" className="mt-4 space-y-6">
          <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="size-4" /> Discador
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sip.regStatus === "unconfigured" && (
            <div className="text-sm text-muted-foreground">
              Configure suas credenciais SIP em{" "}
              <Link to="/settings" className="underline">Configurações → SIP</Link>{" "}
              para começar a discar.
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Número (ex: +5511999998888)"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              disabled={sip.regStatus !== "registered" || !!sip.currentCall}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCall();
              }}
            />
            <Button
              onClick={handleCall}
              disabled={sip.regStatus !== "registered" || !!sip.currentCall || !number.trim()}
            >
              <Phone className="mr-1.5 size-4" />
              Ligar
            </Button>
            <Button
              variant="outline"
              onClick={() => sip.reconnect()}
              disabled={sip.regStatus === "connecting"}
            >
              {sip.regStatus === "connecting" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Reconectar"
              )}
            </Button>
          </div>
          {sip.currentCall && (
            <div className="text-sm text-muted-foreground">
              Em chamada: <span className="font-medium text-foreground">{sip.currentCall.number}</span>{" "}
              · {sip.currentCall.status}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-5">
          <div className="overflow-x-auto"><Table className="min-w-[42rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duração</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!history.isLoading && (history.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Nenhuma chamada ainda.
                  </TableCell>
                </TableRow>
              )}
              {(history.data ?? []).map((c) => {
                const lead = (c as { leads?: { razao_social?: string; nome_fantasia?: string } }).leads;
                const leadName = lead?.nome_fantasia || lead?.razao_social;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      {c.lead_id ? (
                        <Link to="/leads/$id" params={{ id: c.lead_id }} className="underline">
                          {leadName ?? c.lead_id.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.to_number || c.from_number || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{c.direction ?? "out"}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell>{fmtDur(c.duration_sec)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table></div>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <VoiceAiPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
