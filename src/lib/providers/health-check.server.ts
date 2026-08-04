// Health-check adapters per provider. Server-only. Cheap calls only.
import { guardUrl } from "./ssrf-guard.server";

export type HealthResult =
  | "connected"
  | "invalid_credentials"
  | "insufficient_balance"
  | "rate_limited"
  | "unavailable"
  | "invalid_base_url"
  | "unsupported_adapter"
  | "unknown_error";

export interface HealthOutcome {
  result: HealthResult;
  latency_ms: number;
  message: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
}

function classifyStatus(status: number): HealthResult {
  if (status === 401 || status === 403) return "invalid_credentials";
  if (status === 402) return "insufficient_balance";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  if (status >= 200 && status < 300) return "connected";
  return "unknown_error";
}

export async function healthCheck(
  provider: string,
  apiKey: string,
  baseUrl?: string,
): Promise<HealthOutcome> {
  try {
    if (provider === "casa_dos_dados") {
      const base = baseUrl ?? "https://api.casadosdados.com.br/v5";
      // Rota oficial de saldo — GET autenticado, não consome créditos.
      // Docs: https://docs.casadosdados.com.br (Consulta o saldo total e detalhado da conta)
      const url = `${base}/saldo`;
      const { value: res, ms } = await timed(() =>
        fetch(url, {
          method: "GET",
          headers: {
            "api-key": apiKey,
            Accept: "application/json",
            "User-Agent": "JcsProspectingBot/1.0",
          },
        }),
      );
      let result = classifyStatus(res.status);
      // 400/404 ainda indicam que a credencial foi aceita (401/403 = chave inválida).
      if (res.status === 400 || res.status === 404) result = "connected";
      return { result, latency_ms: ms, message: friendly(result, "Casa dos Dados") };
    }
    if (provider === "kipflow") {
      // Kipflow autentica via `x-api-key` (NÃO Bearer). Health check usa uma
      // consulta barata a CNPJ público para validar credencial e URL base.
      // Normaliza URLs antigas (kipflow.com) para o host oficial kipflow.io.
      const rawBase = baseUrl ?? "https://api.kipflow.io/companies/v1";
      const base = /kipflow\.com/i.test(rawBase)
        ? "https://api.kipflow.io/companies/v1"
        : rawBase;
      const url = `${base}/search?cnpj=33000167000101&datasets=basic`;
      const { value: res, ms } = await timed(() =>
        fetch(url, { headers: { "x-api-key": apiKey, Accept: "application/json" } }),
      );
      const result = classifyStatus(res.status);
      return { result, latency_ms: ms, message: friendly(result, "Kipflow") };
    }
    if (provider === "apify") {
      const url = (baseUrl ?? "https://api.apify.com/v2") + "/users/me";
      const { value: res, ms } = await timed(() =>
        fetch(url, { headers: { authorization: `Bearer ${apiKey}` } }),
      );
      const result = classifyStatus(res.status);
      return { result, latency_ms: ms, message: friendly(result, "Apify") };
    }
    if (provider === "custom_api" || provider === "corporate_sites") {
      if (!baseUrl) return { result: "invalid_base_url", latency_ms: 0, message: "URL base não configurada." };
      const g = guardUrl(baseUrl);
      if (!g.ok) return { result: "invalid_base_url", latency_ms: 0, message: `URL base bloqueada (${g.reason}).` };
      const { value: res, ms } = await timed(() => fetch(baseUrl, { method: "HEAD" }));
      const result = classifyStatus(res.status);
      return { result, latency_ms: ms, message: friendly(result, "API personalizada") };
    }
    return { result: "unsupported_adapter", latency_ms: 0, message: "Adapter ainda não disponível." };
  } catch (err) {
    return { result: "unavailable", latency_ms: 0, message: "Provedor indisponível no momento." };
  }
}

function friendly(result: HealthResult, name: string): string {
  switch (result) {
    case "connected": return `${name} conectado com sucesso.`;
    case "invalid_credentials": return "Chave inválida ou sem permissão.";
    case "insufficient_balance": return "Conta sem saldo disponível.";
    case "rate_limited": return "Limite de chamadas atingido. Tente novamente em instantes.";
    case "unavailable": return `${name} indisponível no momento.`;
    case "invalid_base_url": return "URL base inválida ou bloqueada.";
    case "unsupported_adapter": return "Adapter ainda não disponível para este provedor.";
    default: return "Erro desconhecido ao testar conexão.";
  }
}
