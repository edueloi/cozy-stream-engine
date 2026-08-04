import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentOrganizationId } from "@/lib/db/tenant";
import { requireLocalAuth } from "@/lib/local-auth-middleware";

const leadInput = z.object({
  id: z.string().optional(), razao_social: z.string().nullish(), nome_fantasia: z.string().nullish(),
  cnpj: z.string().nullish(), segmento: z.string().nullish(), cidade: z.string().nullish(),
  estado: z.string().nullish(), site: z.string().nullish(), telefone: z.string().nullish(),
  whatsapp: z.string().nullish(), email: z.string().nullish(), notes: z.string().nullish(),
});

const toRow = (lead: any) => ({
  ...lead, razao_social: lead.razaoSocial, nome_fantasia: lead.nomeFantasia,
  agent_id: lead.agentId, created_at: lead.createdAt.toISOString(), updated_at: lead.updatedAt.toISOString(),
});

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .validator((input: { search?: string; status?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    const search = data.search?.trim();
    const rows = await prisma.lead.findMany({
      where: {
        organizationId,
        ...(data.status ? { status: data.status as any } : {}),
        ...(search ? { OR: [
          { razaoSocial: { contains: search } }, { nomeFantasia: { contains: search } },
          { email: { contains: search } }, { cidade: { contains: search } }, { segmento: { contains: search } },
        ] } : {}),
      }, orderBy: [{ score: "desc" }, { createdAt: "desc" }], take: Math.min(data.limit ?? 200, 500),
    });
    return rows.map(toRow);
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .validator((input: { id: string }) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    const lead = await prisma.lead.findFirst({ where: { id: data.id, organizationId } });
    if (!lead) throw new Error("Lead não encontrado.");
    return { lead: toRow(lead), messages: [], calls: [], events: [] };
  });

export const upsertLead = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: unknown) => leadInput.parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    const patch = {
      razaoSocial: data.razao_social || null, nomeFantasia: data.nome_fantasia || null, cnpj: data.cnpj || null,
      segmento: data.segmento || null, cidade: data.cidade || null, estado: data.estado || null, site: data.site || null,
      telefone: data.telefone || null, whatsapp: data.whatsapp || null, email: data.email || null, notes: data.notes || null,
    };
    if (data.id) {
      const existing = await prisma.lead.findFirst({ where: { id: data.id, organizationId }, select: { id: true } });
      if (!existing) throw new Error("Lead não encontrado.");
      await prisma.lead.update({ where: { id: data.id }, data: patch });
      return { id: data.id };
    }
    const lead = await prisma.lead.create({ data: { ...patch, organizationId, ownerId: context.userId } });
    return { id: lead.id };
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: { id: string }) => z.object({ id: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    await prisma.lead.deleteMany({ where: { id: data.id, organizationId } });
    return { ok: true };
  });

export const importLeads = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: { rows: unknown[] }) => z.object({ rows: z.array(leadInput.omit({ id: true })) }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    let inserted = 0; const errors: Array<{ row: number; reason: string; lead: string }> = [];
    for (const [index, row] of data.rows.entries()) {
      if (!row.razao_social && !row.nome_fantasia) { errors.push({ row: index + 2, reason: "Informe razão social ou nome", lead: "" }); continue; }
      await prisma.lead.create({ data: { organizationId, ownerId: context.userId, razaoSocial: row.razao_social || null, nomeFantasia: row.nome_fantasia || null, cnpj: row.cnpj || null, segmento: row.segmento || null, cidade: row.cidade || null, estado: row.estado || null, site: row.site || null, telefone: row.telefone || null, whatsapp: row.whatsapp || null, email: row.email || null, notes: row.notes || null } });
      inserted++;
    }
    return { inserted, failed: errors.length, skipped: 0, errors };
  });

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireLocalAuth])
  .validator((input: { id: string; status: string }) => z.object({ id: z.string(), status: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    await prisma.lead.updateMany({ where: { id: data.id, organizationId }, data: { status: data.status as any } });
    return { ok: true };
  });

export const assignLeadAgent = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: { id: string; agentId?: string | null }) => input).handler(async ({ data, context }) => { const organizationId = await getCurrentOrganizationId(context.userId); await prisma.lead.updateMany({ where: { id: data.id, organizationId }, data: { agentId: data.agentId ?? null } }); return { ok: true }; });
export const bulkAssignAgent = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: { ids: string[]; agentId: string | null }) => input).handler(async ({ data, context }) => { const organizationId = await getCurrentOrganizationId(context.userId); const result = await prisma.lead.updateMany({ where: { id: { in: data.ids }, organizationId }, data: { agentId: data.agentId } }); return { ok: true, updated: result.count }; });
export const bulkSetCadence = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: { ids: string[]; action: "start" | "pause" | "resume" | "stop" }) => input).handler(async ({ data, context }) => { const organizationId = await getCurrentOrganizationId(context.userId); const status = data.action === "stop" ? "descartado" : data.action === "start" || data.action === "resume" ? "em_cadencia" : undefined; const result = status ? await prisma.lead.updateMany({ where: { id: { in: data.ids }, organizationId }, data: { status: status as any } }) : { count: data.ids.length }; return { ok: true, updated: result.count, sent: 0, failed: 0, errors: [] as string[] }; });
export const cadenceKpis = createServerFn({ method: "GET" }).middleware([requireLocalAuth]).handler(async () => ({ sent: 0, delivered: 0, replied: 0, replyRate: 0, inCadence: 0, paused: 0, meetings: 0, qualified: 0, series: [], variants: [] }));
