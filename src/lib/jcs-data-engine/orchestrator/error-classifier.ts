// JCS Data Engine — Error Classifier (puro, sem I/O).
// Classifica erros como retryable, terminal ou unknown.

export type ErrorCategory = "retryable" | "terminal" | "unknown";

export interface ClassifiedError {
  category: ErrorCategory;
  status?: number;
  retry_after_ms?: number;
  reason: string;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TERMINAL_STATUS = new Set([400, 401, 403, 404, 405, 409, 410, 415, 422]);

function extractStatus(err: any): number | undefined {
  if (!err) return undefined;
  const c = err.status ?? err.statusCode ?? err.code ?? err.response?.status;
  const n = typeof c === "string" ? parseInt(c, 10) : c;
  return Number.isFinite(n) ? Number(n) : undefined;
}

function extractRetryAfter(err: any): number | undefined {
  const raw =
    err?.retry_after ??
    err?.retryAfter ??
    err?.response?.headers?.["retry-after"] ??
    err?.headers?.["retry-after"];
  if (raw == null) return undefined;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(n)) return undefined;
  // Se >1000 assume ms, senão segundos.
  return n > 1000 ? n : Math.round(n * 1000);
}

export function classifyError(err: unknown): ClassifiedError {
  const e = err as any;
  const message = (e?.message ?? String(e ?? "")).toLowerCase();
  const status = extractStatus(e);
  const retry_after_ms = extractRetryAfter(e);

  // timeout / network → retryable
  if (message.includes("timeout") || e?.name === "TimeoutError") {
    return { category: "retryable", status, retry_after_ms, reason: "timeout" };
  }
  if (
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("fetch failed") ||
    e?.code === "ECONNRESET" ||
    e?.code === "ECONNREFUSED"
  ) {
    return { category: "retryable", status, retry_after_ms, reason: "network_error" };
  }

  if (status && RETRYABLE_STATUS.has(status)) {
    return { category: "retryable", status, retry_after_ms, reason: `http_${status}` };
  }
  if (status && TERMINAL_STATUS.has(status)) {
    return { category: "terminal", status, reason: `http_${status}` };
  }

  if (
    message.includes("invalid_credentials") ||
    message.includes("invalid credential") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid_request") ||
    message.includes("validation") ||
    message.includes("unsupported_capability") ||
    message.includes("unsupported capability")
  ) {
    return { category: "terminal", status, reason: "terminal_error" };
  }

  return { category: "unknown", status, retry_after_ms, reason: "unknown_error" };
}

export function maxAttemptsFor(category: ErrorCategory): number {
  switch (category) {
    case "retryable":
      return 3;
    case "unknown":
      return 2;
    case "terminal":
      return 1;
  }
}