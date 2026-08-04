import { describe, it, expect } from "vitest";
import { classifyProviderError, sanitizeForLog } from "../failover-classifier";

describe("classifyProviderError", () => {
  it("400 é erro de usuário, sem failover", () => {
    const d = classifyProviderError(new Error("bad request"), 400);
    expect(d.failover).toBe(false);
    expect(d.category).toBe("user_error");
  });
  it("422 é erro de usuário, sem failover", () => {
    const d = classifyProviderError(new Error("unprocessable"), 422);
    expect(d.failover).toBe(false);
  });
  it("401 faz failover (invalid_credentials)", () => {
    const d = classifyProviderError(new Error("x"), 401);
    expect(d.failover).toBe(true);
    expect(d.category).toBe("invalid_credentials");
  });
  it("403 faz failover (invalid_permission)", () => {
    expect(classifyProviderError(new Error(), 403).category).toBe("invalid_permission");
  });
  it("402 faz failover (insufficient_balance)", () => {
    expect(classifyProviderError(new Error(), 402).category).toBe("insufficient_balance");
  });
  it("429 faz failover retriable", () => {
    const d = classifyProviderError(new Error(), 429);
    expect(d.failover).toBe(true);
    expect(d.retriable).toBe(true);
  });
  it("500-599 faz failover", () => {
    expect(classifyProviderError(new Error(), 502).failover).toBe(true);
    expect(classifyProviderError(new Error(), 503).category).toBe("maintenance");
  });
  it("timeout por mensagem faz failover", () => {
    expect(classifyProviderError(new Error("Request timeout after 30s")).category).toBe("timeout");
  });
  it("dns_error por mensagem", () => {
    expect(classifyProviderError(new Error("getaddrinfo ENOTFOUND foo.com")).category).toBe("dns_error");
  });
  it("ssl_error por mensagem", () => {
    expect(classifyProviderError(new Error("SSL handshake failed")).category).toBe("ssl_error");
  });
  it("payload inválido por mensagem NÃO faz failover", () => {
    expect(classifyProviderError(new Error("invalid payload")).failover).toBe(false);
  });
  it("desconhecido cai em unknown (com failover)", () => {
    const d = classifyProviderError(new Error("mystery"));
    expect(d.category).toBe("unknown");
    expect(d.failover).toBe(true);
  });
});

describe("sanitizeForLog", () => {
  it("redige chaves sensíveis em objetos", () => {
    const out = sanitizeForLog({ authorization: "Bearer abc123xyz789", ok: true }) as any;
    expect(out.authorization).toBe("[redacted]");
    expect(out.ok).toBe(true);
  });
  it("redige Bearer em strings", () => {
    const out = sanitizeForLog("Bearer abcdefghijklmn") as string;
    expect(out).toContain("[redacted]");
  });
  it("percorre estruturas aninhadas", () => {
    const out = sanitizeForLog({ headers: { "x-api-key": "sekret1234" } }) as any;
    expect(out.headers["x-api-key"]).toBe("[redacted]");
  });
});