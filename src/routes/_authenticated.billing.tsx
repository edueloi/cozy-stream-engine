import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { listPlans, getCurrentBilling, listBillingEvents } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Plano e Faturamento — JCS SDR" }] }),
  component: BillingPage,
});

type Plan = {
  code: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  limite_usuarios: number;
  limite_leads: number;
  limite_agentes: number;
  limite_mensagens: number;
  max_calls_month: number;
  voice_ai_enabled: boolean;
  apify_enabled: boolean;
  orbit_enabled: boolean;
  white_label_enabled: boolean;
  advanced_analytics_enabled: boolean;
};

type Subscription = {
  status: string;
  plan_code: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

type Usage = {
  users_count: number;
  leads_count: number;
  agents_count: number;
  messages_sent: number;
  calls_made: number;
  apify_runs: number;
} | null;

type Current = {
  organization: { name: string; status: string; trial_ends_at: string | null } | null;
  subscription: Subscription | null;
  plan: Plan | null;
  usage: Usage;
};

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtLimit(limit: number) {
  return limit < 0 ? "ilimitado" : limit.toLocaleString("pt-BR");
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit < 0 ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used.toLocaleString("pt-BR")} / {fmtLimit(limit)}
        </span>
      </div>
      <Progress value={limit < 0 ? 100 : pct} className={pct >= 80 ? "bg-amber-100" : ""} />
    </div>
  );
}

function BillingPage() {
  const fetchPlans = useServerFn(listPlans);
  const fetchCurrent = useServerFn(getCurrentBilling);
  const fetchEvents = useServerFn(listBillingEvents);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Current | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; type: string; description: string | null; amount_cents: number | null; status: string; created_at: string }>>([]);

  useEffect(() => {
    (async () => {
      const [p, c, e] = await Promise.all([fetchPlans(), fetchCurrent(), fetchEvents()]);
      setPlans(p as Plan[]);
      setCurrent(c as Current);
      setEvents(e as never);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trialDaysLeft = (() => {
    const ends = current?.subscription?.trial_ends_at ?? current?.organization?.trial_ends_at;
    if (!ends) return null;
    const ms = new Date(ends).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  })();

  const status = current?.subscription?.status ?? current?.organization?.status ?? "trial";
  const plan = current?.plan;
  const usage = current?.usage;

  return (
    <div className="w-full space-y-4">
      <PageHeader title="Plano e Faturamento" description="Plano atual, uso do mês e upgrade" />

      {current && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Plano atual: {plan?.name ?? "—"}</CardTitle>
              <Badge
                variant={
                  status === "active"
                    ? "default"
                    : status === "trial"
                      ? "secondary"
                      : "destructive"
                }
              >
                {status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {plan && <p className="text-muted-foreground">{plan.description}</p>}
              {trialDaysLeft !== null && (
                <p>
                  <strong>{trialDaysLeft}</strong> dia(s) restante(s) de trial
                </p>
              )}
              {plan && usage && (
                <div className="grid gap-3 sm:grid-cols-2 pt-2">
                  <UsageBar label="Usuários" used={usage.users_count} limit={plan.limite_usuarios} />
                  <UsageBar label="Leads" used={usage.leads_count} limit={plan.limite_leads} />
                  <UsageBar label="Agentes" used={usage.agents_count} limit={plan.limite_agentes} />
                  <UsageBar
                    label="Mensagens (mês)"
                    used={usage.messages_sent}
                    limit={plan.limite_mensagens}
                  />
                  <UsageBar label="Chamadas (mês)" used={usage.calls_made} limit={plan.max_calls_month} />
                  <UsageBar
                    label="Apify (importações)"
                    used={usage.apify_runs}
                    limit={(plan as unknown as { limite_importacoes: number }).limite_importacoes}
                  />
                </div>
              )}
              {(!usage || !plan) && (
                <p className="text-muted-foreground">Sem uso registrado neste mês.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recursos disponíveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>Voice AI: {plan?.voice_ai_enabled ? "✓" : "—"}</div>
              <div>Apify: {plan?.apify_enabled ? "✓" : "—"}</div>
              <div>Orbit CRM: {plan?.orbit_enabled ? "✓" : "—"}</div>
              <div>White Label: {plan?.white_label_enabled ? "✓" : "—"}</div>
              <div>Relatórios avançados: {plan?.advanced_analytics_enabled ? "✓" : "—"}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Comparar planos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => {
              const isCurrent = p.code === plan?.code;
              return (
                <div
                  key={p.code}
                  className={`rounded border p-4 space-y-2 ${isCurrent ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{p.name}</h3>
                    {isCurrent && <Badge>Atual</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground min-h-10">{p.description}</p>
                  <div className="text-xl font-bold">
                    {p.monthly_price_cents > 0 ? brl(p.monthly_price_cents) : "Sob consulta"}
                    <span className="text-xs font-normal text-muted-foreground"> /mês</span>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>Usuários: {fmtLimit(p.limite_usuarios)}</li>
                    <li>Leads: {fmtLimit(p.limite_leads)}</li>
                    <li>Agentes: {fmtLimit(p.limite_agentes)}</li>
                    <li>Mensagens/mês: {fmtLimit(p.limite_mensagens)}</li>
                    <li>Chamadas/mês: {fmtLimit(p.max_calls_month)}</li>
                    <li>Voice AI: {p.voice_ai_enabled ? "✓" : "—"}</li>
                    <li>Apify: {p.apify_enabled ? "✓" : "—"}</li>
                    <li>Orbit: {p.orbit_enabled ? "✓" : "—"}</li>
                    <li>White Label: {p.white_label_enabled ? "✓" : "—"}</li>
                  </ul>
                  <Button
                    className="w-full"
                    disabled={isCurrent}
                    onClick={() => alert("Em breve: integração com gateway de pagamento")}
                  >
                    {isCurrent ? "Plano atual" : "Fazer upgrade"}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Histórico de eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos ainda.</p>
          ) : (
            <ul className="text-sm space-y-2">
              {events.map((e) => (
                <li key={e.id} className="flex justify-between border-b py-1">
                  <span>
                    <strong>{e.type}</strong>
                    {e.description ? ` — ${e.description}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleDateString("pt-BR")} · {e.status}
                    {e.amount_cents ? ` · ${brl(e.amount_cents)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}