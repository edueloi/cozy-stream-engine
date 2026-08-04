import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  listConversations,
  getThread,
  sendWhatsAppMessage,
  sendEmailMessage,
  syncWhatsAppInbound,
  syncWhatsAppInstance,
  resolveHumanFlag,
  listProspectingGroups,
  markThreadRead,
} from "@/lib/outreach.functions";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({ meta: [{ title: "Conversas — JCS SDR" }] }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const fetchList = useServerFn(listConversations);
  const fetchThread = useServerFn(getThread);
  const sendWa = useServerFn(sendWhatsAppMessage);
  const sendMail = useServerFn(sendEmailMessage);
  const syncInbound = useServerFn(syncWhatsAppInbound);
  const syncInstance = useServerFn(syncWhatsAppInstance);
  const resolveFlag = useServerFn(resolveHumanFlag);
  const markRead = useServerFn(markThreadRead);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [onlyHuman, setOnlyHuman] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "arrival" | "prospecting">("none");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const fetchProspecting = useServerFn(listProspectingGroups);

  useEffect(() => {
    if (!selected) return;
    markRead({ data: { leadId: selected } })
      .then(() =>
        qc.setQueryData(
          ["conversations"],
          (prev: { items: Array<{ id: string; unread_count?: number }> } | undefined) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.map((it) =>
                    it.id === selected ? { ...it, unread_count: 0 } : it,
                  ),
                }
              : prev,
        ),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const list = useQuery({ queryKey: ["conversations"], queryFn: () => fetchList() });
  const prospecting = useQuery({
    queryKey: ["prospecting-groups"],
    queryFn: () => fetchProspecting(),
    enabled: groupBy === "prospecting",
  });
  const thread = useQuery({
    queryKey: ["thread", selected],
    queryFn: () => fetchThread({ data: { leadId: selected! } }),
    enabled: !!selected,
  });

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesCount = thread.data?.messages.length ?? 0;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesCount, selected]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: orgId } = await supabase.rpc("current_org_id");
      if (cancelled || !orgId) return;
      channel = supabase
        .channel(`org:${orgId}:messages`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["thread"] });
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [qc]);

  // Auto-sync inbound when a lead is selected and on interval
  useEffect(() => {
    if (!selected) return;
    const run = () => {
      syncInstance()
        .then((r) => {
          if (r.inserted > 0) {
            qc.invalidateQueries({ queryKey: ["conversations"] });
            thread.refetch();
          }
          return syncInbound({ data: { leadId: selected } });
        })
        .then((r) => {
          if (r.inserted > 0) thread.refetch();
        })
        .catch(() => {});
    };
    run();
    const t = setInterval(run, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function send() {
    if (!selected || !reply.trim()) return;
    try {
      if (channel === "whatsapp") {
        await sendWa({ data: { leadId: selected, body: reply } });
      } else {
        await sendMail({
          data: { leadId: selected, subject: subject || "(sem assunto)", body: reply },
        });
      }
      setReply("");
      setSubject("");
      toast.success("Enviado");
      thread.refetch();
      if (channel === "whatsapp") {
        setTimeout(() => {
          syncInstance()
            .then((r) => {
              if (r.inserted > 0) thread.refetch();
              return syncInbound({ data: { leadId: selected } });
            })
            .then((r) => {
              if (r.inserted > 0) thread.refetch();
            })
            .catch(() => {});
        }, 3000);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function manualSync() {
    if (!selected) return;
    try {
      const global = await syncInstance();
      const lead = await syncInbound({ data: { leadId: selected } });
      toast.success(`Sincronizado (${global.inserted + lead.inserted} novas)`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      thread.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function markResolved() {
    if (!selected) return;
    try {
      await resolveFlag({ data: { leadId: selected } });
      toast.success("Sinalização removida");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      thread.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const items = list.data?.items ?? [];
  const humanCount = items.filter((l) => (l as { needs_human?: boolean }).needs_human).length;
  const unreadCount = items.filter((l) => ((l as { unread_count?: number }).unread_count ?? 0) > 0).length;
  const q = search.trim().toLowerCase();
  const filteredItems = items.filter((l) => {
    if (onlyHuman && !(l as { needs_human?: boolean }).needs_human) return false;
    if (onlyUnread && ((l as { unread_count?: number }).unread_count ?? 0) === 0) return false;
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (q) {
      const hay = `${l.nome_fantasia ?? ""} ${l.razao_social ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const statusOptions = Array.from(new Set(items.map((l) => l.status).filter(Boolean))) as string[];

  const searchLabelById = new Map<string, string>();
  for (const g of prospecting.data?.groups ?? []) {
    if (g.id && g.search) {
      searchLabelById.set(
        g.id,
        `${g.search.source_slug} · ${new Date(g.search.created_at).toLocaleDateString()}`,
      );
    }
  }

  type ConvItem = (typeof filteredItems)[number] & {
    prospecting_search_id?: string | null;
    created_at?: string | null;
  };
  const grouped: Array<{ key: string; label: string; items: ConvItem[] }> = (() => {
    if (groupBy === "none") return [{ key: "_all", label: "", items: filteredItems as ConvItem[] }];
    const map = new Map<string, ConvItem[]>();
    for (const l of filteredItems as ConvItem[]) {
      let key = "_none";
      if (groupBy === "arrival") {
        key = l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : "_none";
      } else if (groupBy === "prospecting") {
        key = l.prospecting_search_id ?? "_none";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, arr]) => {
        let label = "Manual / Outros";
        if (key !== "_none") {
          if (groupBy === "arrival") {
            label = new Date(key + "T12:00:00Z").toLocaleDateString();
          } else if (groupBy === "prospecting") {
            label = searchLabelById.get(key) ?? "Prospecção";
          }
        }
        return { key, label, items: arr };
      });
  })();

  return (
    <div className="w-full">
      <PageHeader title="Conversas" description="Histórico unificado por lead" />
      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <Card>
          <CardContent className="p-0 max-h-[70vh] overflow-y-auto">
            <div className="p-2 border-b flex items-center gap-2 text-xs bg-muted/30 sticky top-0 z-10">
              <button
                onClick={() => setOnlyHuman((v) => !v)}
                className={`px-2 py-1 rounded ${onlyHuman ? "bg-destructive text-destructive-foreground" : "bg-background border"}`}
              >
                🚨 Precisam de humano{humanCount > 0 ? ` (${humanCount})` : ""}
              </button>
              <button
                onClick={() => setOnlyUnread((v) => !v)}
                className={`px-2 py-1 rounded ${onlyUnread ? "bg-primary text-primary-foreground" : "bg-background border"}`}
              >
                Não lidas{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </button>
            </div>
            <div className="p-2 border-b bg-muted/20 space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 h-8 text-xs"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-2 border-b bg-muted/20">
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem agrupamento</SelectItem>
                  <SelectItem value="arrival">Agrupar por chegada</SelectItem>
                  <SelectItem value="prospecting">Agrupar por prospecção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {list.isLoading && (
              <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
            )}
            {grouped.map((group) => (
              <div key={group.key}>
                {groupBy !== "none" && (
                  <div className="px-3 py-1.5 bg-muted/50 border-b text-[11px] font-medium uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                    <span className="truncate">{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                )}
                {group.items.map((l) => {
                  const needsHuman = (l as { needs_human?: boolean }).needs_human;
                  const unread = (l as { unread_count?: number }).unread_count ?? 0;
                  return (
                    <button
                      key={l.id}
                      onClick={() => setSelected(l.id)}
                      className={`w-full text-left p-3 border-b hover:bg-muted/50 ${selected === l.id ? "bg-muted" : ""} ${needsHuman ? "border-l-4 border-l-destructive" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`font-medium text-sm truncate flex-1 ${unread > 0 ? "font-semibold" : ""}`}>
                          {needsHuman && <span className="mr-1">🚨</span>}
                          {l.nome_fantasia || l.razao_social || "(sem nome)"}
                        </div>
                        {unread > 0 && selected !== l.id && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-green-500 text-white text-[10px] font-bold">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-2 mt-1 flex-wrap">
                        {needsHuman && (
                          <Badge variant="destructive" className="text-[10px]">Humano</Badge>
                        )}
                        {l.intent_last && <Badge variant="outline">{l.intent_last}</Badge>}
                        <span>{l.status}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
            {list.data && filteredItems.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Nenhum lead ainda.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex flex-col h-[70vh]">
            {!selected ? (
              <div className="m-auto text-sm text-muted-foreground">Selecione um lead</div>
            ) : thread.isLoading ? (
              <div className="m-auto text-sm text-muted-foreground">Carregando...</div>
            ) : (
              <>
                {(thread.data?.lead as { needs_human?: boolean; human_reason?: string } | undefined)?.needs_human && (
                  <div className="mb-2 flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/30 text-xs">
                    <span className="font-medium text-destructive">🚨 Precisa de intervenção humana</span>
                    {(thread.data?.lead as { human_reason?: string }).human_reason && (
                      <span className="text-muted-foreground">
                        · {(thread.data?.lead as { human_reason?: string }).human_reason}
                      </span>
                    )}
                    <Button size="sm" variant="outline" className="ml-auto h-6 text-xs" onClick={markResolved}>
                      Marcar como resolvido
                    </Button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {thread.data?.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-2 rounded text-sm max-w-[80%] ${m.direction === "outbound" ? "ml-auto bg-primary/10" : "bg-muted"}`}
                    >
                      <div className="text-[10px] uppercase opacity-60 mb-1">
                        {m.channel} · {new Date(m.created_at).toLocaleString()}
                        {m.intent ? ` · ${m.intent}` : ""}
                      </div>
                      {m.subject && <div className="font-medium">{m.subject}</div>}
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </div>
                  ))}
                  {thread.data?.messages.length === 0 && (
                    <div className="text-sm text-muted-foreground">Sem mensagens.</div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="mt-3 space-y-2 border-t pt-3">
                  <div className="flex gap-2 text-xs items-center">
                    <button
                      onClick={() => setChannel("whatsapp")}
                      className={`px-2 py-1 rounded ${channel === "whatsapp" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      WhatsApp
                    </button>
                    <button
                      onClick={() => setChannel("email")}
                      className={`px-2 py-1 rounded ${channel === "email" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      Email
                    </button>
                    <button
                      onClick={manualSync}
                      className="ml-auto px-2 py-1 rounded bg-muted hover:bg-muted/70"
                    >
                      Sincronizar
                    </button>
                  </div>
                  {channel === "email" && (
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Assunto"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  )}
                  <Textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Resposta..."
                  />
                  <div className="flex justify-end">
                    <Button onClick={send} disabled={!reply.trim()}>
                      Enviar
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
