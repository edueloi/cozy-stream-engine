import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/db/client";
import { getCurrentOrganizationId } from "@/lib/db/tenant";
import { requireLocalAuth } from "@/lib/local-auth-middleware";

export const getDashboardKpis = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .handler(async ({ context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    const [total, emCadencia, qualificados, reunioes, topLeads, porStatus] = await Promise.all([
      prisma.lead.count({ where: { organizationId } }),
      prisma.lead.count({ where: { organizationId, status: "em_cadencia" } }),
      prisma.lead.count({ where: { organizationId, status: "qualificado" } }),
      prisma.lead.count({ where: { organizationId, status: "reuniao" } }),
      prisma.lead.findMany({
        where: { organizationId },
        select: { id: true, razaoSocial: true, nomeFantasia: true, score: true, status: true, segmento: true, cidade: true },
        orderBy: { score: "desc" },
        take: 5,
      }),
      prisma.lead.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    ]);
    const statusBreakdown: Record<string, number> = {};
    for (const row of porStatus) {
      statusBreakdown[row.status] = row._count._all;
    }
    return {
      total, emCadencia, qualificados, reunioes,
      msgs7: 0, msgs30: 0, respostas: 0, taxaResposta: 0,
      topLeads: topLeads.map((lead) => ({
        id: lead.id, razao_social: lead.razaoSocial, nome_fantasia: lead.nomeFantasia,
        score: lead.score, status: lead.status, segmento: lead.segmento, cidade: lead.cidade,
      })),
      statusBreakdown,
    };
  });
