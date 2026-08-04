import { prisma } from "./client";

export const MANAGER_ROLES = ["superadmin", "admin", "gerente"] as const;

export async function getCurrentOrganizationId(userId: string) {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!profile?.organizationId) throw new Error("Sua conta não está vinculada a uma organização.");
  return profile.organizationId;
}

export async function getUserRoles(userId: string) {
  const rows = await prisma.userRole.findMany({ where: { userId }, select: { role: true } });
  return rows.map(({ role }) => role);
}

export async function assertManager(userId: string) {
  const roles = await getUserRoles(userId);
  if (!roles.some((role) => MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number]))) {
    throw new Error("Acesso restrito a Superadmin, Admin ou Gerente.");
  }
  return roles;
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}
