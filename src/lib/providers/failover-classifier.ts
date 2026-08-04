// Classifica erros de providers para decidir se disparam failover.
// Puro (sem I/O). Testável.

export type FailoverCategory =
  | "invalid_credentials"
  | "invalid_permission"
  | "insufficient_balance"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "network_error"
  | "http_5xx"
  | "connection_refused"
  | "dns_error"
  | "ssl_error"
  | "maintenance"
  | "unsupported_capability"
  | "provider_disabled"
  | "user_error"
  | "unknown";

export interface FailoverDecision {
  category: FailoverCategory;
  failover: boolean;
  retriable: boolean;
  reason: string;
}

function fromStatus(status: number): FailoverDecision | null {
  if (status === 400 || status === 422) {
    return { category: "user_error", failover: false, retriable: false, reason: `http_${status}` };
  }
  if (status === 401) {
    return { category: "invalid_credentials", failover: true, retriable: false, reason: "http_401" };
  }
  if (status === 403) {
    return { category: "invalid_permission", failover: true, retriable: false, reason: "http_403" };
  }
  if (status === 402) {
    return { category: "insufficient_balance", failover: true, retriable: false, reason: "http_402" };
  }
  if (status === 429) {
    return { category: "rate_limited", failover: true, retriable: true, reason: "http_429" };
  }
  if (status === 503) {
    return { category: "maintenance", failover: true, retriable: true, reason: "http_503" };
  }
  if (status >= 500 && status < 600) {
    return { category: "http_5xx", failover: true, retriable: true, reason: `http_${status}` };
  }
  return null;
}

function fromMessage(msg: string): FailoverDecision | null {
  const m = msg.toLowerCase();
  if (/timeout|timed out|etimedout|abort/i.test(m)) {
    return { category: "timeout", failover: true, retriable: true, reason: "timeout" };
  }
  if (/econnrefused|connection refused/i.test(m)) {
    return { category: "connection_refused", failover: true, retriable: true, reason: "connection_refused" };
  }
  if (/enotfound|dns|getaddrinfo/i.test(m)) {
    return { category: "dns_error", failover: true, retriable: true, reason: "dns_error" };
  }
  if (/ssl|tls|cert/i.test(m)) {
    return { category: "ssl_error", failover: true, retriable: false, reason: "ssl_error" };
  }
  if (/network|fetch failed|socket|econnreset/i.test(m)) {
    return { category: "network_error", failover: true, retriable: true, reason: "network_error" };
  }
  if (/insufficient|no balance|saldo|no credits?/i.test(m)) {
    return { category: "insufficient_balance", failover: true, retriable: false, reason: "insufficient_balance" };
  }
  if (/rate.?limit|too many requests/i.test(m)) {
    return { category: "rate_limited", failover: true, retriable: true, reason: "rate_limited" };
  }
  if (/invalid.?(key|token|credential)|unauthorized/i.test(m)) {
    return { category: "invalid_credentials", failover: true, retriable: false, reason: "invalid_credentials" };
  }
  if (/forbidden|permission/i.test(m)) {
    return { category: "invalid_permission", failover: true, retriable: false, reason: "invalid_permission" };
  }
  if (/unavailable|maintenance|degraded/i.test(m)) {
    return { category: "provider_unavailable", failover: true, retriable: true, reason: "provider_unavailable" };
  }
  if (/unsupported|no capability|not implemented/i.test(m)) {
    return { category: "unsupported_capability", failover: true, retriable: false, reason: "unsupported_capability" };
  }
  if (/disabled|not enabled/i.test(m)) {
    return { category: "provider_disabled", failover: true, retriable: false, reason: "provider_disabled" };
  }
  if (/invalid.?payload|invalid.?param|bad.?request|validation/i.test(m)) {
    return { category: "user_error", failover: false, retriable: false, reason: "invalid_payload" };
  }
  return null;
}

export function classifyProviderError(
  err: unknown,
  httpStatus?: number | null,
): FailoverDecision {
  if (typeof httpStatus === "number") {
    const byStatus = fromStatus(httpStatus);
    if (byStatus) return byStatus;
  }
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : String(err ?? "");
  const byMsg = fromMessage(msg);
  if (byMsg) return byMsg;
  return { category: "unknown", failover: true, retriable: true, reason: msg || "unknown_error" };
}

// Sanitiza cabeçalhos/mensagens antes de logar. Nunca deve vazar segredos.
const SECRET_KEYS = /^(authorization|api[-_]?key|x[-_]?api[-_]?key|bearer|secret|token|password)$/i;

export function sanitizeForLog(input: unknown): unknown {
  if (input == null) return input;
  if (typeof input === "string") {
    return input
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/gi, "$1[redacted]")
      .replace(/(api[-_]?key["'\s:=]+)[A-Za-z0-9._~+/=-]{6,}/gi, "$1[redacted]");
  }
  if (Array.isArray(input)) return input.map(sanitizeForLog);
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[redacted]" : sanitizeForLog(v);
    }
    return out;
  }
  return input;
}