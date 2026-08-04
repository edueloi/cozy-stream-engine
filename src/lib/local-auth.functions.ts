import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? "jcs-sdr-local-development-secret-change-me");

async function issueToken(userId: string, email: string, roles: string[]) {
  return new SignJWT({ email, roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
}

export const localSignIn = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string }) => z.object({ email: z.string().email(), password: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const user = await prisma.user.findUnique({
      where: { email: data.email.trim().toLowerCase() },
      include: { roles: true, profile: true },
    });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      throw new Error("E-mail ou senha inválidos.");
    }
    const roles = user.roles.map(({ role }) => role);
    return { token: await issueToken(user.id, user.email, roles), user: { id: user.id, email: user.email, name: user.profile?.name ?? user.email, roles } };
  });

export async function getLocalSession(token: string) {
  const { payload } = await jwtVerify(token, secret);
  if (!payload.sub || typeof payload.email !== "string") throw new Error("Sessão inválida.");
  const roles = Array.isArray(payload.roles) ? payload.roles.filter((role): role is string => typeof role === "string") : [];
  return { id: payload.sub, email: payload.email, roles };
}
