// Anti-SSRF guard for custom REST connector.
// Blocks non-HTTPS, private/loopback/link-local ranges, forbidden headers.

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

const FORBIDDEN_HEADERS = new Set([
  "host",
  "cookie",
  "set-cookie",
  "x-forwarded-for",
  "x-real-ip",
  "authorization",
]);

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

export function guardUrl(input: string): GuardResult {
  let u: URL;
  try { u = new URL(input); } catch { return { ok: false, reason: "invalid_url" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "only_https_allowed" };
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost_blocked" };
  }
  // IPv4 literal check
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    for (const re of PRIVATE_V4) if (re.test(host)) return { ok: false, reason: "private_ip_blocked" };
  }
  // IPv6 loopback / ULA / link-local
  if (host === "::1" || host.startsWith("[::1")) return { ok: false, reason: "private_ip_blocked" };
  if (/^\[?(fc|fd)[0-9a-f]{2}:/i.test(host)) return { ok: false, reason: "private_ip_blocked" };
  if (/^\[?fe80:/i.test(host)) return { ok: false, reason: "private_ip_blocked" };
  return { ok: true };
}

export function guardHeaders(headers: Record<string, string> | undefined): GuardResult {
  if (!headers) return { ok: true };
  for (const k of Object.keys(headers)) {
    if (FORBIDDEN_HEADERS.has(k.toLowerCase())) return { ok: false, reason: `forbidden_header:${k}` };
  }
  return { ok: true };
}