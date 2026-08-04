import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/db/client";
import { getCurrentOrganizationId } from "@/lib/db/tenant";
import { requireLocalAuth } from "@/lib/local-auth-middleware";

async function localDiagnostics(context: { userId: string; email: string; roles: string[] }) {
  if (!context.roles.includes("superadmin")) throw new Error("Acesso restrito ao SuperAdmin.");
  const organizationId = await getCurrentOrganizationId(context.userId);
  const [organization, leads] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
    prisma.lead.count({ where: { organizationId } }),
  ]);
  const flags = {
    banco_mysql_local: true,
    autenticacao_local: true,
    supabase_desativado: true,
    ia_configurada: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
  };
  const providers: any[] = [];
  return {
    generatedAt: new Date().toISOString(), release: "Local MySQL", environment: process.env.NODE_ENV === "production" ? "produção" : "desenvolvimento",
    user: { id: context.userId, email: context.email, roles: context.roles },
    organization: { id: organization?.id ?? organizationId, name: organization?.name ?? "Organização local" },
    flags,
    flow: { current: "local", reason: "Operação usando MySQL local." },
    orchestrator: { status: "idle", total: 0, lastRunAt: null, avgDurationMs: 0, queued: 0, retries: 0, fallbacks: 0, cancelled: 0 },
    providers, capabilities: [],
    integrations: [
      { name: "Banco MySQL", status: "connected" },
      { name: "Autenticação local", status: "connected" },
      { name: "IA", status: flags.ia_configurada ? "connected" : "not_connected" },
    ],
    health: [
      { name: "Banco de dados", status: "green", note: "MySQL conectado" },
      { name: "Autenticação", status: "green", note: "Sessão local ativa" },
      { name: "IA", status: flags.ia_configurada ? "green" : "yellow", note: flags.ia_configurada ? "Chave configurada" : "Configure uma chave em Configurações" },
    ],
    recentErrors: [], lastExecution: null,
    stats: { totalExecutions: 0, today: 0, week: 0, month: 0, avgDurationMs: 0, fallbacks: 0, retries: 0, leads, products: 0, icps: 0 },
    checklist: [
      { item: "Banco MySQL conectado", ok: true }, { item: "Sessão local ativa", ok: true },
      { item: "Leads cadastrados", ok: leads > 0 }, { item: "IA configurada", ok: flags.ia_configurada },
    ],
  };
}

export const getDiagnostics = createServerFn({ method: "GET" }).middleware([requireLocalAuth]).handler(async ({ context }) => localDiagnostics(context));

export const runSelfCheck = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).handler(async ({ context }) => {
  const data = await localDiagnostics(context);
  const results = data.checklist.map((item) => ({ name: item.item, level: item.ok ? "ok" as const : "warn" as const, message: item.ok ? "Verificado" : "Requer configuração" }));
  return { level: results.some((result) => result.level === "warn") ? "warn" : "ok", results, ranAt: new Date().toISOString() };
});
