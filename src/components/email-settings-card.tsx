import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listEmailConnections,
  startEmailOAuth,
  disconnectEmail,
  updateEmailPrefs,
} from "@/lib/email-connections.functions";

export function EmailSettingsCard() {
  const startFn = useServerFn(startEmailOAuth);
  const listFn = useServerFn(listEmailConnections);
  const disconnectFn = useServerFn(disconnectEmail);
  const prefsFn = useServerFn(updateEmailPrefs);

  const conns = useQuery({ queryKey: ["email-connections"], queryFn: () => listFn() });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("email");
    if (status === "success") {
      toast.success("E-mail conectado");
      conns.refetch();
    } else if (status === "error") {
      toast.error(params.get("emailMsg") || "Falha ao conectar e-mail");
    }
    if (status) {
      params.delete("email");
      params.delete("emailMsg");
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
    if (!confirm("Desconectar e-mail?")) return;
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
  const active = google || microsoft;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Meu E-mail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Conecte sua conta de e-mail (Gmail ou Microsoft 365). O agente vai enviar mensagens da
          cadência usando o seu próprio remetente.
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Row
            name="Gmail"
            connected={!!google}
            email={google?.email ?? null}
            onConnect={() => connect("google")}
            onDisconnect={() => disconnect("google")}
          />
          <Row
            name="Microsoft 365"
            connected={!!microsoft}
            email={microsoft?.email ?? null}
            onConnect={() => connect("microsoft")}
            onDisconnect={() => disconnect("microsoft")}
          />
        </div>

        {active && (
          <PrefsBlock
            initial={{ sender_name: active.sender_name ?? "", signature: active.signature ?? "" }}
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
      </CardContent>
    </Card>
  );
}

function Row(props: { name: string; connected: boolean; email: string | null; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <div className="border rounded-lg p-3 flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">{props.name}</div>
        <div className="text-xs text-muted-foreground">{props.connected ? (props.email ?? "conectado") : "não conectado"}</div>
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

function PrefsBlock({ initial, onSave }: { initial: { sender_name: string; signature: string }; onSave: (p: { sender_name?: string; signature?: string }) => void }) {
  const [name, setName] = useState(initial.sender_name);
  const [sig, setSig] = useState(initial.signature);
  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="text-sm font-medium">Identidade do remetente</div>
      <div className="grid sm:grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Nome do remetente</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João da Silva — Vendas" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Assinatura</Label>
          <Textarea rows={4} value={sig} onChange={(e) => setSig(e.target.value)} placeholder="Sua assinatura padrão (HTML simples permitido)" />
        </div>
      </div>
      <Button size="sm" onClick={() => onSave({ sender_name: name, signature: sig })}>Salvar</Button>
    </div>
  );
}