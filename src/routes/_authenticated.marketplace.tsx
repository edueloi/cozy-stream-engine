import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Star, Heart, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  listTemplates, installTemplate, toggleFavorite, rateTemplate, marketplaceStats,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/marketplace")({
  component: MarketplacePage,
});

const TABS = [
  { id: "agent", label: "Agentes" },
  { id: "cadence", label: "Cadências" },
  { id: "package", label: "Pacotes" },
  { id: "jcs", label: "JCS Store" },
  { id: "mine", label: "Meus Templates" },
  { id: "favs", label: "Favoritos" },
] as const;

function MarketplacePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("agent");
  const [q, setQ] = useState("");
  const list = useServerFn(listTemplates);
  const install = useServerFn(installTemplate);
  const fav = useServerFn(toggleFavorite);
  const rate = useServerFn(rateTemplate);
  const statsFn = useServerFn(marketplaceStats);
  const qc = useQueryClient();

  const filter = (() => {
    if (tab === "jcs") return { jcsOnly: true };
    if (tab === "favs") return { favoritesOnly: true };
    if (tab === "mine") return {};
    return { kind: tab };
  })();

  const { data: items = [] } = useQuery({
    queryKey: ["marketplace", tab, q],
    queryFn: () => list({ data: { ...filter, q: q || undefined } }),
  });
  const { data: stats } = useQuery({ queryKey: ["marketplace-stats"], queryFn: () => statsFn() });

  const installMut = useMutation({
    mutationFn: (template_id: string) => install({ data: { template_id } }),
    onSuccess: () => { toast.success("Template instalado"); qc.invalidateQueries({ queryKey: ["marketplace"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao instalar"),
  });
  const favMut = useMutation({
    mutationFn: (template_id: string) => fav({ data: { template_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace"] }),
  });
  const rateMut = useMutation({
    mutationFn: (v: { template_id: string; stars: number }) => rate({ data: v }),
    onSuccess: () => { toast.success("Avaliação registrada"); qc.invalidateQueries({ queryKey: ["marketplace"] }); },
  });

  return (
    <div className="w-full">
        <PageHeader title="Marketplace" description="Instale agentes e cadências prontos em 1 clique." />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard label="Templates instalados" value={stats?.installed ?? 0} />
          <StatCard label="Mais baixado" value={stats?.top?.[0]?.name ?? "—"} />
          <StatCard label="Melhor avaliado" value={
            (stats?.top ?? []).slice().sort((a: any, b: any) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))[0]?.name ?? "—"
          } />
          <StatCard label="Total disponível" value={items.length} />
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por nome..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.id} value={t.id} className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-full">Nenhum template encontrado.</p>
                )}
                {items.map((it: any) => (
                  <Card key={it.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{it.name}</CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => favMut.mutate(it.id)}>
                          <Heart className={"size-4 " + (it.is_favorite ? "fill-red-500 text-red-500" : "")} />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline">{it.kind}</Badge>
                        {it.category && <Badge variant="secondary">{it.category}</Badge>}
                        {it.is_jcs_official && <Badge>JCS</Badge>}
                        {it.channel && <Badge variant="outline">{it.channel}</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm text-muted-foreground line-clamp-3">{it.description}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="size-3" /> {Number(it.avg_rating ?? 0).toFixed(1)} ({it.rating_count ?? 0})
                        </span>
                        <span>{it.install_count ?? 0} instalações</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button key={s} onClick={() => rateMut.mutate({ template_id: it.id, stars: s })}>
                            <Star className={"size-4 " + (s <= Math.round(it.avg_rating ?? 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
                          </button>
                        ))}
                      </div>
                      <Button className="w-full" size="sm" disabled={installMut.isPending} onClick={() => installMut.mutate(it.id)}>
                        <Download className="size-4 mr-1.5" /> Instalar
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
      </Tabs>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold mt-1 truncate">{value}</p>
      </CardContent>
    </Card>
  );
}