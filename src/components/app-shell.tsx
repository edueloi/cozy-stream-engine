import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  PhoneCall,
  Upload,
  Settings,
  LogOut,
  Layers,
  UserCog,
  Bot,
  Sparkles,
  CreditCard,
  Building2,
  Search,
  BookOpen,
  Wand2,
  Store,
  CalendarDays,
  Target,
  Package,
  Activity,
  Menu,
} from "lucide-react";
import { getCurrentUser, signOut } from "@/lib/local-auth";
import { Button } from "@/components/ui/button";
import { Toaster } from "sonner";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/prospecting", label: "Prospecção", icon: Search },
  { to: "/ideal-customer-profiles", label: "Público Ideal (ICP)", icon: Target },
  { to: "/products", label: "Produtos", icon: Package },
  { to: "/import", label: "Importar", icon: Upload },
  { to: "/conversations", label: "Conversas", icon: MessageSquare },
  { to: "/calls", label: "Chamadas", icon: PhoneCall },
  { to: "/cadences", label: "Cadências A/B", icon: Layers },
  { to: "/agents", label: "Agentes", icon: Bot },
  { to: "/agent-optimization", label: "Otimização IA", icon: Sparkles },
  { to: "/agent-builder", label: "Agent Builder", icon: Wand2 },
  { to: "/knowledge", label: "Conhecimento", icon: BookOpen },
  { to: "/marketplace", label: "Marketplace", icon: Store },
  { to: "/my-calendar", label: "Minha Agenda", icon: CalendarDays },
  { to: "/users", label: "Usuários", icon: UserCog, managerOnly: true },
  { to: "/billing", label: "Plano e Faturamento", icon: CreditCard, adminOnly: true },
  { to: "/settings", label: "Configurações", icon: Settings, adminOnly: true },
  { to: "/admin/saas", label: "Admin SaaS", icon: Building2, superadminOnly: true },
  { to: "/diagnostics", label: "Diagnóstico", icon: Activity, superadminOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [userState, setUserState] = useState({ email: "", isManager: false, isAdmin: false, isSuperadmin: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [permissionsReady, setPermissionsReady] = useState(false);

  const { email, isManager, isAdmin, isSuperadmin } = userState;

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setUserState({
      email: user.email,
      isManager: user.roles.some((role) => ["superadmin", "admin", "gerente"].includes(role)),
      isAdmin: user.roles.some((role) => ["superadmin", "admin"].includes(role)),
      isSuperadmin: user.roles.includes("superadmin"),
    });
    setPermissionsReady(true);
  }, [navigate]);

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,oklch(0.94_0.04_250_/_0.7),transparent_32rem),linear-gradient(180deg,oklch(0.99_0.006_250),var(--muted))]">
      <Toaster richColors position="top-right" />
      {menuOpen && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[1px] md:hidden" onClick={() => setMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 shadow-xl shadow-slate-950/15 transition-transform duration-200 md:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="border-b border-slate-800 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500 text-sm font-bold text-white shadow-sm shadow-blue-500/30">
              J
            </div>
            <div className="min-w-0">
              <div className="font-semibold tracking-tight text-white">JCS SDR</div>
              <div className="mt-0.5 text-xs text-slate-400">Prospecção com IA</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Navegação
          </div>
          <div className="space-y-1">
          {NAV.filter((n) => {
            // Mantém o HTML inicial igual no servidor e no navegador; evita o menu "aparecer" depois.
            if (!permissionsReady) return true;
            if ("managerOnly" in n && n.managerOnly && !isManager) return false;
            if ("adminOnly" in n && n.adminOnly && !isAdmin) return false;
            if ("superadminOnly" in n && n.superadminOnly && !isSuperadmin) return false;
            return true;
          }).map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                preload="intent"
                onClick={() => setMenuOpen(false)}
                className={
                  "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "bg-blue-500 text-white font-medium shadow-sm before:absolute before:-left-3 before:h-5 before:w-1 before:rounded-r before:bg-blue-300"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white")
                }
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
          </div>
        </nav>
        <div className="border-t border-slate-800 p-3 space-y-2">
          <div className="truncate px-2 text-xs text-slate-400" title={email}>
            {email}
          </div>
          <Button variant="outline" size="sm" className="w-full border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white" onClick={handleLogout}>
            <LogOut className="size-3.5 mr-1.5" />
            Sair
          </Button>
        </div>
      </aside>
      <main className="min-h-screen min-w-0 overflow-x-hidden md:ml-64">
        <div className="sticky top-0 z-20 flex h-14 items-center border-b border-border/70 bg-background/75 px-4 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <span className="ml-2 text-sm font-semibold">JCS SDR</span>
        </div>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="app-page-header">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
