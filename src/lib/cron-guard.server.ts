import { timingSafeEqual } from "crypto";

export function verifyCronRequest(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) return new Response("cron secret not configured", { status: 500 });
  const provided = request.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}