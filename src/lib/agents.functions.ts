import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentOrganizationId } from "@/lib/db/tenant";
import { requireLocalAuth } from "@/lib/local-auth-middleware";

async function readAgents(userId: string) {
  const organizationId = await getCurrentOrganizationId(userId);
  const rows = await prisma.$queryRawUnsafe<Array<{ config: unknown }>>("SELECT config FROM app_settings WHERE organization_id = ? LIMIT 1", organizationId);
  const config = rows[0]?.config && typeof rows[0].config === "object" ? rows[0].config as Record<string, unknown> : {};
  return { organizationId, config, agents: Array.isArray(config.agents) ? config.agents as any[] : [] };
}
async function writeAgents(organizationId: string, config: Record<string, unknown>, agents: any[]) {
  await prisma.$executeRawUnsafe("INSERT INTO app_settings (organization_id, config) VALUES (?, CAST(? AS JSON)) ON DUPLICATE KEY UPDATE config = VALUES(config)", organizationId, JSON.stringify({ ...config, agents }));
}

export const listAgents = createServerFn({ method: "GET" }).middleware([requireLocalAuth]).handler(async ({ context }) => ({ items: (await readAgents(context.userId)).agents }));
export const upsertAgent = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => z.object({ name: z.string().min(1), id: z.string().optional() }).passthrough().parse(input)).handler(async ({ data, context }) => {
  const state = await readAgents(context.userId); const id = data.id ?? crypto.randomUUID(); const agent = { ...data, id, created_at: data.id ? undefined : new Date().toISOString(), updated_at: new Date().toISOString() };
  const agents = data.id ? state.agents.map((item) => item.id === id ? { ...item, ...agent } : item) : [agent, ...state.agents]; await writeAgents(state.organizationId, state.config, agents); return { ok: true, id };
});
export const deleteAgent = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: { id: string }) => z.object({ id: z.string() }).parse(input)).handler(async ({ data, context }) => { const state = await readAgents(context.userId); await writeAgents(state.organizationId, state.config, state.agents.filter((item) => item.id !== data.id)); return { ok: true }; });
export const listTrainings = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: { agentId: string }) => z.object({ agentId: z.string() }).parse(input)).handler(async ({ data, context }) => { const agent = (await readAgents(context.userId)).agents.find((item) => item.id === data.agentId); return { items: agent?.trainings ?? [] }; });
export const upsertTraining = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: any) => z.object({ agent_id: z.string(), id: z.string().optional() }).passthrough().parse(input)).handler(async ({ data, context }) => { const state = await readAgents(context.userId); const training = { ...data, id: data.id ?? crypto.randomUUID() }; const agents = state.agents.map((agent) => agent.id !== data.agent_id ? agent : { ...agent, trainings: data.id ? (agent.trainings ?? []).map((item: any) => item.id === data.id ? training : item) : [training, ...(agent.trainings ?? [])] }); await writeAgents(state.organizationId, state.config, agents); return { ok: true }; });
export const deleteTraining = createServerFn({ method: "POST" }).middleware([requireLocalAuth]).validator((input: { id: string }) => z.object({ id: z.string() }).parse(input)).handler(async ({ data, context }) => { const state = await readAgents(context.userId); const agents = state.agents.map((agent) => ({ ...agent, trainings: (agent.trainings ?? []).filter((item: any) => item.id !== data.id) })); await writeAgents(state.organizationId, state.config, agents); return { ok: true }; });
