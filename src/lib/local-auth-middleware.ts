import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAuthToken } from "@/lib/local-auth";
import { getLocalSession } from "@/lib/local-auth.functions";

export const attachLocalAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getAuthToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

export const requireLocalAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const authorization = request?.headers.get("authorization");
  const cookieToken = request?.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("jcs_sdr_session="))
    ?.slice("jcs_sdr_session=".length);
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : cookieToken ? decodeURIComponent(cookieToken) : null;
  if (!token) throw new Error("Não autorizado.");
  const user = await getLocalSession(token);
  return next({ context: { userId: user.id, email: user.email, roles: user.roles } });
});
