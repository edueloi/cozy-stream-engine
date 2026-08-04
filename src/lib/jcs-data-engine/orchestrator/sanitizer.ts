// Sanitização recursiva antes de persistir resultados/logs.

const SECRET_KEYS = new Set([
  "raw", "headers", "api_key", "apikey", "api-key",
  "authorization", "auth", "token", "access_token", "refresh_token",
  "secret", "client_secret", "password", "cookie", "cookies",
  "request_payload", "request", "response", "response_body",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function sanitize<T = unknown>(input: T, depth = 0): T {
  if (depth > 8) return null as unknown as T;
  if (input == null) return input;
  if (Array.isArray(input)) {
    return input.map((v) => sanitize(v, depth + 1)) as unknown as T;
  }
  if (isPlainObject(input)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (SECRET_KEYS.has(k.toLowerCase())) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out as unknown as T;
  }
  return input;
}