import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDashboardKpis } from "@/lib/dashboard.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app-shell";
import { Users, Activity, MessageCircle, Calendar, TrendingUp, Clock, ShieldAlert, PauseCircle, ThumbsUp } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — JCS SDR" }] }),
  component: DashboardPage,
});

type KpiColor = "blue" | "violet" | "emerald" | "amber" | "sky" | "rose";

const kpiColorMap: Record<KpiColor, { icon: string; value: string; bar: string }> = {
  blue:    { icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",    value: "text-blue-700 dark:text-blue-300",    bar: "bg-blue-500"    },
  violet:  { icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400", value: "text-violet-700 dark:text-violet-300", bar: "bg-violet-500" },
  emerald: { icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", value: "text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500" },
  amber:   { icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",  value: "text-amber-700 dark:text-amber-300",  bar: "bg-amber-500"  },
  sky:     { icon: "bg-sky-500/10 text-sky-600 dark:text-sky-400",        value: "text-sky-700 dark:text-sky-300",      bar: "bg-sky-500"    },
  rose:    { icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",     value: "text-rose-700 dark:text-rose-300",    bar: "bg-rose-500"   },
};

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
  color = "blue",
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  color?: KpiColor;
}) {
  const c = kpiColorMap[color];
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-xs hover:shadow-md hover:border-border/80 transition-all duration-200 ease-out overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
              {label}
            </p>
            <p className={`text-3xl font-bold tracking-tight ${c.value}`}>
              {value}
            </p>
            {hint && (
              <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>
            )}
          </div>
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${c.icon}`}>
            <Icon className="size-5" />
          </div>
        </div>
      </div>
      <div className={`h-0.5 w-full ${c.bar} opacity-30`} />
    </div>
  );
}

function DashboardPage() {
  const fetchKpis = useServerFn(getDashboardKpis);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchKpis() });
  const adv = null;
  const orbit = null;

  return (
    <div className="w-full space-y-6">
      <PageHeader title="Dashboard" description="Visão geral da operação SDR" />

      {isLoading || !data ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi label="Total de leads" value={data.total} icon={Users} color="blue" />
            <Kpi label="Em cadência" value={data.emCadencia} icon={Activity} color="violet" />
            <Kpi label="Qualificados" value={data.qualificados} icon={TrendingUp} color="emerald" />
            <Kpi label="Reuniões agendadas" value={data.reunioes} icon={Calendar} color="amber" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Kpi label="Mensagens enviadas (7d)" value={data.msgs7} icon={MessageCircle} color="sky" />
            <Kpi label="Mensagens enviadas (30d)" value={data.msgs30} icon={MessageCircle} color="violet" />
            <Kpi label="Taxa de resposta (30d)" value={`${data.taxaResposta}%`} icon={TrendingUp} hint={`${data.respostas} respostas`} color="rose" />
          </div>

          {orbit && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
              <Kpi label="Enviados ao Orbit" value={orbit.sent_to_orbit} icon={TrendingUp} />
              <Kpi label="Erros de sync" value={orbit.sync_errors} icon={ShieldAlert} />
              <Kpi label="Oportunidades ganhas" value={orbit.opportunities_won} icon={ThumbsUp} />
              <Kpi label="Oportunidades perdidas" value={orbit.opportunities_lost} icon={ShieldAlert} />
              <Kpi label="SDR → Orbit" value={`${orbit.sdr_to_orbit_conversion}%`} icon={TrendingUp} />
            </div>
          )}

          {adv && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <Kpi
                  label="Resposta positiva (30d)"
                  value={`${adv.totals.positiveRate}%`}
                  icon={ThumbsUp}
                  hint="das respostas classificadas"
                />
                <Kpi
                  label="Tempo médio 1ª resposta"
                  value={
                    adv.totals.avgFirstResponseMin >= 60
                      ? `${Math.round(adv.totals.avgFirstResponseMin / 60)}h`
                      : `${adv.totals.avgFirstResponseMin}m`
                  }
                  icon={Clock}
                />
                <Kpi label="Opt-out" value={adv.totals.optOuts} icon={ShieldAlert} />
                <Kpi label="IA pausada" value={adv.totals.paused} icon={PauseCircle} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Funil de conversão</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { stage: "Coletado", value: adv.funnel.coletado },
                            { stage: "Em cadência", value: adv.funnel.em_cadencia },
                            { stage: "Qualificado", value: adv.funnel.qualificado },
                            { stage: "Reunião", value: adv.funnel.reuniao },
                            { stage: "Convertido", value: adv.funnel.convertido },
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Volume de mensagens (14d)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={adv.daily}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="out" name="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="in" name="Recebidas" stroke="hsl(var(--chart-2, var(--accent)))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base">Performance por passo de cadência</CardTitle>
                </CardHeader>
                <CardContent>
                  {adv.cadencePerf.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-2 px-2">Dia</th>
                            <th className="py-2 px-2">Enviadas</th>
                            <th className="py-2 px-2">Respostas</th>
                            <th className="py-2 px-2">Reply rate</th>
                            <th className="py-2 px-2">Positivas</th>
                            <th className="py-2 px-2">Negativas</th>
                            <th className="py-2 px-2">Positive rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adv.cadencePerf.map((r) => (
                            <tr key={r.day} className="border-b last:border-0">
                              <td className="py-2 px-2 font-medium">D{r.day}</td>
                              <td className="py-2 px-2">{r.out}</td>
                              <td className="py-2 px-2">{r.replies}</td>
                              <td className="py-2 px-2">
                                <Badge variant={r.replyRate >= 15 ? "default" : "secondary"}>{r.replyRate}%</Badge>
                              </td>
                              <td className="py-2 px-2 text-emerald-600">{r.positive}</td>
                              <td className="py-2 px-2 text-red-600">{r.negative}</td>
                              <td className="py-2 px-2">
                                <Badge variant={r.positiveRate >= 50 ? "default" : "secondary"}>{r.positiveRate}%</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 5 leads por score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.topLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum lead ainda.</p>
                ) : (
                  data.topLeads.map((l) => (
                    <Link
                      key={l.id}
                      to="/leads/$id"
                      params={{ id: l.id }}
                      className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/60 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {l.nome_fantasia || l.razao_social || "(sem nome)"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {l.segmento || "—"} · {l.cidade || "—"}
                        </div>
                      </div>
                      <Badge variant="secondary">{Number(l.score)}</Badge>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads por status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(data.statusBreakdown).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  Object.entries(data.statusBreakdown).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{k.replace("_", " ")}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
