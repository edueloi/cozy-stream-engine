import { createServerFn } from "@tanstack/react-start";
import { prisma } from "@/lib/db/client";
import { getCurrentOrganizationId } from "@/lib/db/tenant";
import { requireLocalAuth } from "@/lib/local-auth-middleware";

const unavailable = () => { throw new Error("Envios serão habilitados após a configuração local de WhatsApp e e-mail."); };

export const sendWhatsAppMessage = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(unavailable);
export const sendEmailMessage = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(unavailable);

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .validator((input: any) => input ?? {})
  .handler(async () => ({ items: [] }));

export const markThreadRead = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(async () => ({ ok: true }));
export const resolveHumanFlag = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(async () => ({ ok: true }));
export const getThread = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(async () => ({ messages: [], lead: null }));
export const syncWhatsAppInbound = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(async () => ({ ok: true }));
export const syncWhatsAppInstance = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(async () => ({ ok: true }));

export async function sendCadenceStep(..._args: any[]) {
  unavailable();
}

export const runLeadCadence = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(unavailable);
export const runCadenceBatch = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(unavailable);

export const listProspectingGroups = createServerFn({ method: "GET" })
  .middleware([requireLocalAuth])
  .handler(async ({ context }) => {
    const organizationId = await getCurrentOrganizationId(context.userId);
    const rows = await prisma.lead.groupBy({ by: ["createdAt"], where: { organizationId }, _count: { _all: true } });
    return { groups: rows.map((row) => ({ id: row.createdAt.toISOString(), count: row._count._all, with_agent: 0, in_cadence: 0, search: null })) };
  });

export const bulkApplyToProspecting = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(async () => ({ updated: 0, sent: 0 }));
export const listArrivalGroups = createServerFn({ method: "GET" }).middleware([requireLocalAuth]).handler(async () => ({ groups: [] }));
export const bulkApplyToArrival = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => input).handler(async () => ({ updated: 0, sent: 0 }));
