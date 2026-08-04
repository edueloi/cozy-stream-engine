import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSettings, updateSettings, configureEvolutionWebhook, rotateInboundToken, testSmtp, createEvolutionInstance, getEvolutionConnectionState, logoutEvolutionInstance } from "@/lib/settings.functions";
import { getOrbitConfig, saveOrbitConfig, testOrbitConnectionFn, listOrbitPipelinesFn } from "@/lib/orbit.functions";
import { listAgents } from "@/lib/agents.functions";
import { getMyRoles } from "@/lib/users.functions";
import { Link } from "@tanstack/react-router";
import { Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app-shell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — JCS SDR" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const fetchFn = useServerFn(getSettings);
  const saveFn = useServerFn(updateSettings);
  const configWebhookFn = useServerFn(configureEvolutionWebhook);
  const rotateInboundFn = useServerFn(rotateInboundToken);
  const testSmtpFn = useServerFn(testSmtp);
  const createInstanceFn = useServerFn(createEvolutionInstance);
  const connStateFn = useServerFn(getEvolutionConnectionState);
  const logoutInstanceFn = useServerFn(logoutEvolutionInstance);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connState, setConnState] = useState<string>("");
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const { data, error, refetch } = useQuery({ queryKey: ["settings"], queryFn: () => fetchFn() });
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      const init: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) init[k] = v.join(", ");
        else if (v === null || v === undefined) init[k] = "";
        else init[k] = String(v);
      }
      setForm(init);
    }
  }, [data]);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    const toBool = (v: string | undefined) => v === "true" || v === "1";
    const toInt = (v: string | undefined, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) && v !== "" ? Math.trunc(n) : def;
    };
    const payload = {
      ...form,
      icp_segmentos: form.icp_segmentos
        ? form.icp_segmentos.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      icp_cidades: form.icp_cidades
        ? form.icp_cidades.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      smtp_port: form.smtp_port ? Number(form.smtp_port) : 587,
      whatsapp_daily_limit: toInt(form.whatsapp_daily_limit, 200),
      whatsapp_send_window_start: toInt(form.whatsapp_send_window_start, 8),
      whatsapp_send_window_end: toInt(form.whatsapp_send_window_end, 20),
      whatsapp_min_interval_seconds: toInt(form.whatsapp_min_interval_seconds, 30),
      send_days: (form.send_days ?? "1, 2, 3, 4, 5")
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      reengage_after_days: toInt(form.reengage_after_days, 7),
      reengage_enabled: toBool(form.reengage_enabled),
      lost_recover_enabled: toBool(form.lost_recover_enabled),
      ab_enabled: toBool(form.ab_enabled),
      smtp_use_ssl: toBool(form.smtp_use_ssl),
      smtp_use_tls: toBool(form.smtp_use_tls),
      smtp_auth_enabled: toBool(form.smtp_auth_enabled),
      auto_cadence_enabled: toBool(form.auto_cadence_enabled),
      auto_cadence_default_agent_id: form.auto_cadence_default_agent_id || null,
      inbound_enabled: toBool(form.inbound_enabled),
      inbound_business_hours_enabled: toBool(form.inbound_business_hours_enabled),
      inbound_create_lead_automatically: toBool(form.inbound_create_lead_automatically),
      inbound_pause_cadence_on_message: toBool(form.inbound_pause_cadence_on_message),
      inbound_support_mode_enabled: toBool(form.inbound_support_mode_enabled),
      inbound_default_agent_id: form.inbound_default_agent_id || null,
      inbound_handoff_user_id: form.inbound_handoff_user_id || null,
      inbound_after_hours_message: form.inbound_after_hours_message ?? "",
      max_inbound_interactions: toInt(form.max_inbound_interactions, 25),
    };
    try {
      await saveFn({ data: payload as never });
      toast.success("Configurações salvas");
      refetch();
      // Auto-configura o webhook na Evolution quando credenciais estão presentes
      if (form.whatsapp_instance_url && form.whatsapp_instance_name && form.whatsapp_api_key) {
        try {
          const webhookUrl = `${window.location.origin}/api/public/whatsapp/webhook`;
          await configWebhookFn({ data: { webhookUrl } });
          toast.success("Webhook registrado automaticamente na Evolution");
        } catch (e) {
          toast.error("Configurações salvas, mas falhou ao registrar webhook: " + (e as Error).message);
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function configureWebhook() {
    try {
      const webhookUrl = `${window.location.origin}/api/public/whatsapp/webhook`;
      const r = await configWebhookFn({ data: { webhookUrl } });
      toast.success("Webhook configurado na Evolution");
      console.log("Evolution webhook response:", r);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function connectWhatsApp() {
    if (!form.whatsapp_instance_url || !form.whatsapp_instance_name) {
      toast.error("Preencha URL e nome da instância e clique em Salvar antes.");
      return;
    }
    setQrOpen(true);
    setQrLoading(true);
    setQrBase64(null);
    setPairingCode(null);
    setConnState("aguardando QR...");
    try {
      const webhookUrl = `${window.location.origin}/api/public/whatsapp/webhook`;
      const r = await createInstanceFn({ data: { webhookUrl } });
      setQrBase64(r.qrBase64 ?? null);
      setPairingCode(r.pairingCode ?? null);
      if (!r.qrBase64 && !r.pairingCode) {
        setConnState("já conectado ou aguarde…");
      } else {
        setConnState("escaneie o QR no WhatsApp");
      }
    } catch (e) {
      toast.error((e as Error).message);
      setQrOpen(false);
    } finally {
      setQrLoading(false);
    }
  }

  async function disconnectWhatsApp() {
    if (!confirm("Desconectar a instância do WhatsApp?")) return;
    try {
      await logoutInstanceFn();
      toast.success("Instância desconectada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Polling de estado enquanto o dialog do QR estiver aberto
  useEffect(() => {
    if (!qrOpen) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await connStateFn();
        if (cancelled) return;
        setConnState(r.state);
        if (r.state === "open" || r.state === "connected") {
          toast.success("WhatsApp conectado!");
          // Auto-config webhook após conectar
          try {
            const webhookUrl = `${window.location.origin}/api/public/whatsapp/webhook`;
            await configWebhookFn({ data: { webhookUrl } });
          } catch { /* ignore */ }
          setQrOpen(false);
        }
      } catch { /* ignore */ }
    };
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [qrOpen, connStateFn, configWebhookFn]);

  async function rotateToken() {
    if (!confirm("Gerar novo token de inbound? Formulários antigos vão parar de funcionar.")) return;
    try {
      await rotateInboundFn();
      toast.success("Token regenerado");
      refetch();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function runTestSmtp() {
    if (!testTo) { toast.error("Informe um email de destino"); return; }
    setTesting(true);
    try {
      await saveFn({ data: {
        smtp_use_ssl: form.smtp_use_ssl === "true" || form.smtp_use_ssl === "1",
        smtp_use_tls: form.smtp_use_tls === "true" || form.smtp_use_tls === "1",
        smtp_auth_enabled: form.smtp_auth_enabled === "true" || form.smtp_auth_enabled === "1",
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port ? Number(form.smtp_port) : 587,
        smtp_user: form.smtp_user,
        smtp_from_email: form.smtp_from_email,
        smtp_from_name: form.smtp_from_name,
        ...(form.smtp_pass ? { smtp_pass: form.smtp_pass } : {}),
      } as never });
      const r = await testSmtpFn({ data: { to: testTo } });
      if (r.ok) toast.success(`Email enviado! (${r.messageId ?? "ok"})`);
      else toast.error(`Falhou: ${r.error}`);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  if (error) return <div className="p-6 text-sm text-destructive">Não foi possível carregar as configurações: {(error as Error).message}</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="w-full space-y-4">
      <PageHeader title="Configurações" description="Agente IA, ICP e integrações" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agente de IA</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome" k="agent_name" form={form} set={set} />
          <Field label="Modelo LLM" k="llm_model" form={form} set={set} />
          <FieldArea label="Personalidade" k="agent_personality" form={form} set={set} cols={2} />
          <FieldArea label="Produto/serviço" k="agent_product" form={form} set={set} cols={2} />
          <FieldArea label="Objeções comuns" k="agent_objections" form={form} set={set} cols={2} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ICP (Perfil de Cliente Ideal)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Segmentos (separados por vírgula)" k="icp_segmentos" form={form} set={set} />
          <Field label="Cidades (separadas por vírgula)" k="icp_cidades" form={form} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">WhatsApp (Evolution API)</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="URL da instância" k="whatsapp_instance_url" form={form} set={set} />
          <Field label="Nome da instância" k="whatsapp_instance_name" form={form} set={set} />
          <Field
            label={`API Key ${data.whatsapp_api_key_masked ? "(atual: " + data.whatsapp_api_key_masked + ")" : ""}`}
            k="whatsapp_api_key"
            form={form}
            set={set}
            placeholder="Deixe vazio para manter"
            cols={2}
          />
          <div className="sm:col-span-2 space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={connectWhatsApp}>
                Conectar WhatsApp (QR Code)
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={disconnectWhatsApp}>
                Desconectar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={configureWebhook}>
                Reconfigurar webhook
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Salve as configurações acima e clique em <strong>Conectar WhatsApp</strong>. O sistema cria a instância,
              registra o webhook e mostra o QR Code para você escanear no app do WhatsApp.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMTP (Email)</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Host" k="smtp_host" form={form} set={set} />
          <Field label="Porta" k="smtp_port" form={form} set={set} />
          <Field label="Usuário" k="smtp_user" form={form} set={set} />
          <Field
            label={`Senha ${data.smtp_pass_masked ? "(atual: " + data.smtp_pass_masked + ")" : ""}`}
            k="smtp_pass"
            form={form}
            set={set}
            placeholder="Deixe vazio para manter"
          />
          <Field label="From email" k="smtp_from_email" form={form} set={set} />
          <Field label="From nome" k="smtp_from_name" form={form} set={set} />
          <BoolField label="TLS (STARTTLS)" k="smtp_use_tls" form={form} set={set} />
          <BoolField label="SSL (porta 465)" k="smtp_use_ssl" form={form} set={set} />
          <BoolField label="Autenticação SMTP" k="smtp_auth_enabled" form={form} set={set} cols={2} />
          <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 space-y-2">
            <Label className="text-xs uppercase">Testar configuração</Label>
            <div className="flex gap-2">
              <Input
                placeholder="seu-email@exemplo.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <Button type="button" variant="secondary" disabled={testing} onClick={runTestSmtp}>
                {testing ? "Enviando..." : "Enviar email de teste"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Salva as configurações atuais e dispara um email de teste para validar o SMTP.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apify (coleta de leads)</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field
            label={`Token ${data.apify_token_masked ? "(atual: " + data.apify_token_masked + ")" : ""}`}
            k="apify_token"
            form={form}
            set={set}
            placeholder="Deixe vazio para manter"
          />
          <Field label="Actor ID" k="apify_actor_id" form={form} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voz (Twilio) & Agendamento</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="Número Twilio (E.164)" k="twilio_from_number" form={form} set={set} />
          <Field label="Link Calendly/Cal.com" k="booking_link" form={form} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agenda &amp; Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A integração com Google e Microsoft é gerenciada pela plataforma. Cada usuário conecta sua
            própria agenda e e-mail em <a href="/my-calendar" className="underline">Minha Agenda</a>.
          </p>
          <p className="text-xs">
            Opcional: defina um remetente de fallback para envios automáticos quando o dono do lead
            não tiver e-mail conectado.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <Field label="Email remetente fallback" k="fallback_sender_email" form={form} set={set} />
            <Field label="Nome do remetente fallback" k="fallback_sender_name" form={form} set={set} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anti-ban WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-4 gap-3">
          <Field label="Limite diário" k="whatsapp_daily_limit" form={form} set={set} />
          <Field label="Janela início (h)" k="whatsapp_send_window_start" form={form} set={set} />
          <Field label="Janela fim (h)" k="whatsapp_send_window_end" form={form} set={set} />
          <Field label="Intervalo mín (s)" k="whatsapp_min_interval_seconds" form={form} set={set} />
          <div className="sm:col-span-4">
            <Label className="text-sm">Dias de envio</Label>
            <div className="flex flex-wrap gap-3 mt-2">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, idx) => {
                const current = (form.send_days ?? "1, 2, 3, 4, 5")
                  .split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
                const checked = current.includes(idx);
                return (
                  <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? Array.from(new Set([...current, idx])).sort()
                          : current.filter((d) => d !== idx);
                        set("send_days", next.join(", "));
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Mensagens só serão enviadas nos dias e horários marcados.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reengajamento & recuperação</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <BoolField label="Reengajar leads parados automaticamente" k="reengage_enabled" form={form} set={set} cols={2} />
          <Field label="Dias parado para reengajar" k="reengage_after_days" form={form} set={set} />
          <BoolField label="Recuperar leads perdidos (após N dias do motivo)" k="lost_recover_enabled" form={form} set={set} cols={2} />
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Os jobs rodam quando agendados via cron interno (1×/dia). Você pode rodar agora chamando: <span className="font-mono">POST {typeof window !== "undefined" ? window.location.origin : ""}/api/public/cron/reengage</span> e <span className="font-mono">/api/public/cron/recover-lost</span>.
          </p>
        </CardContent>
      </Card>

      <InboundAttendanceCard form={form} set={set} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inbound público (formulários)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
            <Label className="text-xs uppercase">Endpoint</Label>
            <div className="text-xs font-mono break-all">
              POST {typeof window !== "undefined" ? window.location.origin : ""}/api/public/inbound-lead
            </div>
            <Label className="text-xs uppercase mt-2 block">Token (header <span className="font-mono">x-inbound-token</span> ou query <span className="font-mono">?token=</span>)</Label>
            <div className="text-xs font-mono break-all">{(data as any).inbound_token || "(salve uma vez)"}</div>
            <div className="pt-2">
              <Button type="button" size="sm" variant="secondary" onClick={rotateToken}>
                Regenerar token
              </Button>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Body JSON aceito: razao_social, nome_fantasia, email, whatsapp, telefone, segmento, cidade, estado, mensagem, origem. Pelo menos um de email/whatsapp/telefone é obrigatório.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A/B de cadências</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <BoolField label="Usar variantes A/B quando existirem" k="ab_enabled" form={form} set={set} />
          <p className="text-xs text-muted-foreground">
            Cadastre variantes em Cadências A/B. Quando ativo, ao enviar o sistema escolhe a variante pelo peso e mede reply/positive rate por variante.
          </p>
        </CardContent>
      </Card>

      <AutoCadenceCard form={form} set={set} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voz (SIP / WebRTC)</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <Field label="SIP Server" k="sip_server" form={form} set={set} placeholder="sip4.uscall.com.br" />
          <Field label="Domain" k="sip_domain" form={form} set={set} placeholder="sip4.uscall.com.br" />
          <Field label="WebSocket URL (wss://)" k="sip_ws_url" form={form} set={set} placeholder="wss://sip4.uscall.com.br:7443" cols={2} />
          <Field label="Username" k="sip_username" form={form} set={set} placeholder="jcs-1003" />
          <Field label="Display name" k="sip_display_name" form={form} set={set} />
          <Field
            label={`Senha ${(data as { sip_password_masked?: string }).sip_password_masked ? "(atual: " + (data as { sip_password_masked?: string }).sip_password_masked + ")" : ""}`}
            k="sip_password"
            form={form}
            set={set}
            placeholder="Deixe vazio para manter"
            cols={2}
          />
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Chamadas saem direto do navegador via WebRTC. A operadora SIP precisa expor WebSocket Seguro (wss://). Após salvar, o discador (canto inferior direito) registra automaticamente.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save}>Salvar configurações</Button>
      </div>

      <OrbitIntegrationCard />
      <DataProvidersCard />

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular &gt; Aparelhos conectados &gt; Conectar um aparelho e escaneie o QR abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrLoading && <p className="text-sm text-muted-foreground">Gerando QR...</p>}
            {qrBase64 && (
              <img
                src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code"
                className="w-64 h-64 rounded border bg-white p-2"
              />
            )}
            {pairingCode && (
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Ou use o código de pareamento:</p>
                <p className="text-lg font-mono font-bold tracking-wider">{pairingCode}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Status: {connState || "—"}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrbitIntegrationCard() {
  const fetchFn = useServerFn(getOrbitConfig);
  const saveFn = useServerFn(saveOrbitConfig);
  const testFn = useServerFn(testOrbitConnectionFn);
  const listPipesFn = useServerFn(listOrbitPipelinesFn);
  const { data, refetch } = useQuery({ queryKey: ["orbit-config"], queryFn: () => fetchFn() });
  const [form, setForm] = useState<Record<string, string>>({});
  const [autoSync, setAutoSync] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingPipes, setLoadingPipes] = useState(false);
  const [pipelines, setPipelines] = useState<{ id: string; name: string; stages: { id: string; name: string }[] }[]>([]);

  useEffect(() => {
    const c = data?.config;
    if (!c) return;
    setForm({
      api_url: c.api_url ?? "",
      api_token: "",
      default_pipeline_id: c.default_pipeline_id ?? "",
      qualified_stage_id: c.qualified_stage_id ?? "",
      meeting_stage_id: c.meeting_stage_id ?? "",
      lost_stage_id: c.lost_stage_id ?? "",
      default_owner_id: c.default_owner_id ?? "",
      score_threshold: String(c.score_threshold ?? 70),
    });
    setAutoSync(!!c.auto_sync_enabled);
  }, [data]);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSave() {
    try {
      await saveFn({
        data: {
          api_url: form.api_url,
          ...(form.api_token ? { api_token: form.api_token } : {}),
          default_pipeline_id: form.default_pipeline_id || null,
          qualified_stage_id: form.qualified_stage_id || null,
          meeting_stage_id: form.meeting_stage_id || null,
          lost_stage_id: form.lost_stage_id || null,
          default_owner_id: form.default_owner_id || null,
          auto_sync_enabled: autoSync,
          score_threshold: form.score_threshold ? Number(form.score_threshold) : 70,
        },
      });
      toast.success("Integração Orbit salva");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onTest() {
    setTesting(true);
    try {
      const r = await testFn();
      if (r.ok) toast.success("Conexão com Orbit OK");
      else toast.error(`Falhou: ${r.error ?? `HTTP ${r.status}`}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  const masked = data?.config?.api_token_masked;

  async function onLoadPipelines() {
    setLoadingPipes(true);
    try {
      const r = await listPipesFn();
      setPipelines(r.pipelines ?? []);
      if ((r.pipelines ?? []).length === 0) toast.info("Nenhum funil encontrado no Orbit");
      else toast.success(`${r.pipelines.length} funil(is) carregado(s)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingPipes(false);
    }
  }

  const selectedPipe = pipelines.find((p) => p.id === form.default_pipeline_id);
  const stageOptions = selectedPipe?.stages ?? [];

  function StageSelect({ k, label }: { k: string; label: string }) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        {stageOptions.length > 0 ? (
          <Select value={form[k] ?? ""} onValueChange={(v) => set(k, v)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma etapa" />
            </SelectTrigger>
            <SelectContent>
              {stageOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} placeholder="Carregue o funil para escolher" />
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integração Orbit CRM</CardTitle>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        <Field label="Orbit API URL" k="api_url" form={form} set={set} placeholder="https://api.orbitcrm.com/v1" cols={2} />
        <Field
          label={`Orbit API Token ${masked ? "(atual: " + masked + ")" : ""}`}
          k="api_token"
          form={form}
          set={set}
          placeholder="Deixe vazio para manter"
          cols={2}
        />
        <div className="sm:col-span-2 flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Funil padrão</Label>
            {pipelines.length > 0 ? (
              <Select value={form.default_pipeline_id ?? ""} onValueChange={(v) => set("default_pipeline_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um funil" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={form.default_pipeline_id ?? ""}
                onChange={(e) => set("default_pipeline_id", e.target.value)}
                placeholder="Clique em 'Carregar do CRM'"
              />
            )}
          </div>
          <Button type="button" variant="secondary" onClick={onLoadPipelines} disabled={loadingPipes}>
            {loadingPipes ? "Carregando..." : "Carregar do CRM"}
          </Button>
        </div>
        <StageSelect k="qualified_stage_id" label="Etapa: lead qualificado" />
        <StageSelect k="meeting_stage_id" label="Etapa: reunião agendada" />
        <StageSelect k="lost_stage_id" label="Etapa: lead perdido" />
        <Field label="Usuário responsável padrão" k="default_owner_id" form={form} set={set} />
        <Field label="Score mínimo para sincronizar" k="score_threshold" form={form} set={set} placeholder="70" />
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm">Ativar sincronização automática quando lead for qualificado</span>
        </label>
        <div className="sm:col-span-2 rounded-md border bg-muted/30 p-3 space-y-1.5">
          <Label className="text-xs uppercase">Webhook do Orbit (configure no Orbit)</Label>
          <div className="text-xs font-mono break-all">
            POST {typeof window !== "undefined" ? window.location.origin : ""}/api/public/orbit/webhook
          </div>
          <div className="text-xs">
            Header: <span className="font-mono">x-orbit-token: (use o mesmo API Token ou configure webhook_token)</span>
          </div>
        </div>
        <div className="sm:col-span-2 flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onTest} disabled={testing}>
            {testing ? "Testando..." : "Testar conexão"}
          </Button>
          <Button type="button" onClick={onSave}>Salvar Orbit</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DataProvidersCard() {
  const rolesFn = useServerFn(getMyRoles);
  const { data } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const roles = ((data as any)?.roles ?? []) as string[];
  const isAdmin = roles.includes("superadmin") || roles.includes("admin");
  if (!isAdmin) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="h-4 w-4" />
          Integrações de Prospecção
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          A configuração das fontes de dados (Casa dos Dados, Kipflow, Apify, API própria,
          Webhook, Sites Corporativos) foi movida para <strong>Prospecção → Integrações</strong>.
        </p>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  k,
  form,
  set,
  placeholder,
  cols,
}: {
  label: string;
  k: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  placeholder?: string;
  cols?: number;
}) {
  return (
    <div className={"space-y-1.5 " + (cols === 2 ? "sm:col-span-2" : "")}>
      <Label>{label}</Label>
      <Input value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function FieldArea({
  label,
  k,
  form,
  set,
  cols,
}: {
  label: string;
  k: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  cols?: number;
}) {
  return (
    <div className={"space-y-1.5 " + (cols === 2 ? "sm:col-span-2" : "")}>
      <Label>{label}</Label>
      <Textarea rows={3} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
}

function BoolField({
  label,
  k,
  form,
  set,
  cols,
}: {
  label: string;
  k: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  cols?: number;
}) {
  const checked = form[k] === "true" || form[k] === "1";
  return (
    <label className={"flex items-center gap-2 " + (cols === 2 ? "sm:col-span-2" : "")}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => set(k, e.target.checked ? "true" : "false")}
        className="size-4"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function AutoCadenceCard({
  form,
  set,
}: {
  form: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  const fetchAgents = useServerFn(listAgents);
  const { data: agents } = useQuery({ queryKey: ["agents-list"], queryFn: () => fetchAgents() });
  const enabled = form.auto_cadence_enabled === "true" || form.auto_cadence_enabled === "1";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cadência automática para novos leads</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <BoolField label="Iniciar cadência automaticamente quando um novo lead for criado" k="auto_cadence_enabled" form={form} set={set} />
        <div className="space-y-1.5">
          <Label>Agente padrão</Label>
          <select
            disabled={!enabled}
            value={form.auto_cadence_default_agent_id ?? ""}
            onChange={(e) => set("auto_cadence_default_agent_id", e.target.value)}
            className="w-full h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="">Sem agente padrão</option>
            {(agents?.items ?? []).map((a: { id: string; name: string }) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Todo lead novo (importado, criado manualmente, prospectado ou via inbound) entra em cadência usando este agente.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InboundAttendanceCard({
  form,
  set,
}: {
  form: Record<string, string>;
  set: (k: string, v: string) => void;
}) {
  const fetchAgents = useServerFn(listAgents);
  const { data: agents } = useQuery({ queryKey: ["agents-list"], queryFn: () => fetchAgents() });
  const enabled = form.inbound_enabled === "true" || form.inbound_enabled === "1";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atendimento Inbound WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        <BoolField
          label="Ativar atendimento automático para mensagens espontâneas (fora de cadência)"
          k="inbound_enabled" form={form} set={set} cols={2}
        />
        <BoolField
          label="Criar lead automaticamente para contatos novos"
          k="inbound_create_lead_automatically" form={form} set={set} cols={2}
        />
        <BoolField
          label="Respeitar horário comercial (usa dias e janela do Anti-ban)"
          k="inbound_business_hours_enabled" form={form} set={set} cols={2}
        />
        <BoolField
          label="Modo suporte: encaminhar clientes existentes para atendimento humano"
          k="inbound_support_mode_enabled" form={form} set={set} cols={2}
        />
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Agente padrão para inbound</Label>
          <select
            disabled={!enabled}
            value={form.inbound_default_agent_id ?? ""}
            onChange={(e) => set("inbound_default_agent_id", e.target.value)}
            className="w-full h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="">Sem agente padrão</option>
            {(agents?.items ?? []).map((a: { id: string; name: string; agent_type?: string | null }) => (
              <option key={a.id} value={a.id}>
                {a.name}{a.agent_type ? ` — ${a.agent_type}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Field label="Usuário responsável (owner) do handoff — UUID" k="inbound_handoff_user_id" form={form} set={set} cols={2} />
        <Field label="Máximo de interações antes do handoff" k="max_inbound_interactions" form={form} set={set} />
        <FieldArea
          label="Mensagem fora do horário comercial"
          k="inbound_after_hours_message"
          form={form}
          set={set}
          cols={2}
        />
        <p className="sm:col-span-2 text-xs text-muted-foreground">
          Quando alguém enviar mensagem no WhatsApp <b>sem estar em cadência</b>, o Conversation Router usa este agente para atender, classificar a intenção (comercial, suporte, financeiro…) e transferir para humano quando necessário. Cadências ativas continuam usando o agente SDR normalmente.
        </p>
      </CardContent>
    </Card>
  );
}
