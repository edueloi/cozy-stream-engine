import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { listProviders, saveProviderCredential, deleteProviderCredential, testProviderConnection, setProviderEnabled } from "@/lib/providers/providers.functions";
import type { ProviderMeta } from "@/lib/providers/catalog";

export const Route = createFileRoute("/_authenticated/settings/providers")({
  head: () => ({ meta: [{ title: "Provedores de Dados — JCS SDR" }] }),
  component: ProvidersPage,
});

type Row = ProviderMeta & { credential: null | Record<string, unknown> };

function ProvidersPage() {
  const listFn = useServerFn(listProviders);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["providers-center"],
    queryFn: () => listFn(),
  });
  const [editing, setEditing] = useState<Row | null>(null);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!data) return null;

  if (!data.flag_enabled) {
    return (
      <div className="space-y-4">
        <PageHeader title="Provedores de Dados" description="Central de integrações da sua organização." />
        <Card><CardContent className="py-8 text-sm text-muted-foreground">
          Este recurso está em rollout controlado. Solicite à equipe JCS para ativá-lo em sua organização.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Provedores de Dados" description="Cadastre suas próprias credenciais. Segredos nunca voltam ao navegador." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.providers.map((p) => (
          <ProviderCard key={p.id} row={p as Row} onConfigure={() => setEditing(p as Row)} onChanged={() => qc.invalidateQueries({ queryKey: ["providers-center"] })} />
        ))}
      </div>
      {editing ? (
        <ProviderDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["providers-center"] }); }}
        />
      ) : null}
    </div>
  );
}

function ProviderCard({ row, onConfigure, onChanged }: { row: Row; onConfigure: () => void; onChanged: () => void }) {
  const testFn = useServerFn(testProviderConnection);
  const delFn = useServerFn(deleteProviderCredential);
  const toggleFn = useServerFn(setProviderEnabled);
  const [testing, setTesting] = useState(false);
  const cred = row.credential as any;
  const enabled: boolean = cred?.enabled !== false;
  const status: string = cred ? (enabled ? cred?.status ?? "unknown" : "disabled") : "not_connected";
  const badgeVariant = status === "connected" ? "default" : status === "not_connected" || status === "disabled" ? "outline" : "secondary";
  return (
    <Card className={row.adapterAvailable ? "" : "opacity-60"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>{row.name}</span>
          <Badge variant={badgeVariant as any}>{labelFor(status)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{row.description}</p>
        {cred?.last4 ? <p>Credencial: ••••{cred.last4}</p> : null}
        {cred?.last_test_at ? <p className="text-xs text-muted-foreground">Último teste: {new Date(cred.last_test_at).toLocaleString("pt-BR")}</p> : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={onConfigure} disabled={!row.adapterAvailable}>
            {row.adapterAvailable ? "Configurar" : "Adapter em breve"}
          </Button>
          {cred ? (
            <>
              <Button size="sm" variant="outline" disabled={testing || !row.adapterAvailable || !enabled} onClick={async () => {
                setTesting(true);
                try {
                  const res: any = await testFn({ data: { provider: row.id } });
                  toast[res.result === "connected" ? "success" : "error"](res.message);
                  onChanged();
                } finally { setTesting(false); }
              }}>{testing ? "Testando…" : "Testar conexão"}</Button>
              <Button size="sm" variant="outline" onClick={async () => {
                await toggleFn({ data: { provider: row.id, enabled: !enabled } });
                toast.success(enabled ? "Provedor desativado." : "Provedor ativado.");
                onChanged();
              }}>{enabled ? "Desativar" : "Ativar"}</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                if (!confirm("Remover a credencial deste provedor? Esta ação apaga a chave cifrada.")) return;
                await delFn({ data: { provider: row.id } });
                toast.success("Credencial removida.");
                onChanged();
              }}>Remover</Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function labelFor(status: string): string {
  switch (status) {
    case "connected": return "Conectado";
    case "invalid_credentials": return "Credencial inválida";
    case "insufficient_balance": return "Sem saldo";
    case "rate_limited": return "Limite atingido";
    case "unavailable": return "Indisponível";
    case "invalid_base_url": return "URL inválida";
    case "unsupported_adapter": return "Sem adapter";
    case "not_connected": return "Não conectado";
    case "disabled": return "Desativado";
    default: return "Aguardando teste";
  }
}

function ProviderDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const saveFn = useServerFn(saveProviderCredential);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState<string>((row.credential as any)?.base_url ?? row.defaultBaseUrl ?? "");
  const [mode, setMode] = useState<"organization" | "platform" | "disabled">(((row.credential as any)?.credential_mode ?? "organization") as any);
  const [priority, setPriority] = useState<number>((row.credential as any)?.priority ?? 100);
  const [dailyLimit, setDailyLimit] = useState<number | "">(((row.credential as any)?.daily_limit ?? "") as number | "");
  const [monthlyLimit, setMonthlyLimit] = useState<number | "">(((row.credential as any)?.monthly_limit ?? "") as number | "");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar {row.name}</DialogTitle>
          <DialogDescription>
            {row.credential ? "Deixe a chave em branco para preservar a credencial atual." : "Cole a API Key. Ela será cifrada e nunca voltará ao navegador."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>API Key</Label>
            <Input type="password" autoComplete="off" placeholder={(row.credential as any)?.last4 ? `••••${(row.credential as any).last4}` : "Cole a chave"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div>
            <Label>URL Base</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={row.defaultBaseUrl ?? "https://..."} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Modo</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Minha conta</SelectItem>
                  <SelectItem value="platform">Créditos JCS SDR</SelectItem>
                  <SelectItem value="disabled">Desativado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" min={1} max={1000} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
            <div>
              <Label>Limite diário</Label>
              <Input type="number" min={0} placeholder="Sem limite" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div>
              <Label>Limite mensal</Label>
              <Input type="number" min={0} placeholder="Sem limite" value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button disabled={saving} onClick={async () => {
            setSaving(true);
            try {
              await saveFn({ data: { provider: row.id, mode, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined, priority, daily_limit: dailyLimit === "" ? undefined : dailyLimit, monthly_limit: monthlyLimit === "" ? undefined : monthlyLimit } });
              toast.success("Credencial salva.");
              onSaved();
            } catch (e: any) {
              toast.error(e?.message ?? "Erro ao salvar.");
            } finally { setSaving(false); }
          }}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}