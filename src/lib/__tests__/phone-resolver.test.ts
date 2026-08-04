import { describe, it, expect } from "vitest";
import {
  normalizeBrazilianPhone,
  resolveLeadMessagingPhone,
  formatPhoneForDisplay,
} from "../phone-resolver";

describe("normalizeBrazilianPhone", () => {
  it("celular BR sem DDI → adiciona 55", () => {
    expect(normalizeBrazilianPhone("(15) 99799-2929")).toBe("5515997992929");
    expect(normalizeBrazilianPhone("15 99799-2929")).toBe("5515997992929");
  });
  it("celular BR com DDI → preserva", () => {
    expect(normalizeBrazilianPhone("+55 15 99799-2929")).toBe("5515997992929");
  });
  it("fixo BR com DDD → adiciona 55", () => {
    expect(normalizeBrazilianPhone("15 3226-9100")).toBe("551532269100");
    expect(normalizeBrazilianPhone("1532269100")).toBe("551532269100");
  });
  it("vazio / inválido → null", () => {
    expect(normalizeBrazilianPhone("")).toBe(null);
    expect(normalizeBrazilianPhone("abc")).toBe(null);
    expect(normalizeBrazilianPhone("123")).toBe(null);
  });
  it("internacional já com DDI (>=12 dígitos) preserva", () => {
    expect(normalizeBrazilianPhone("+1 415 555 12345")).toBe("1415555 12345".replace(/\D/g, ""));
  });
});

describe("resolveLeadMessagingPhone", () => {
  it("1. WhatsApp preenchido → usa WhatsApp", () => {
    const r = resolveLeadMessagingPhone({ whatsapp: "15997992929", phone: null });
    expect(r.source).toBe("whatsapp");
    expect(r.normalizedPhone).toBe("5515997992929");
    expect(r.isValid).toBe(true);
  });
  it("2. WhatsApp vazio + Telefone válido → usa Telefone", () => {
    const r = resolveLeadMessagingPhone({ whatsapp: null, phone: "15997992929" });
    expect(r.source).toBe("phone");
    expect(r.normalizedPhone).toBe("5515997992929");
    expect(r.verificationStatus).toBe("phone_resolved_from_phone");
  });
  it("3. WhatsApp inválido + Telefone válido → usa Telefone", () => {
    const r = resolveLeadMessagingPhone({ whatsapp: "abc", phone: "15997992929" });
    expect(r.source).toBe("phone");
    expect(r.isValid).toBe(true);
  });
  it("4. Ambos iguais com formatação diferente → dedup (mesmo normalized)", () => {
    const r = resolveLeadMessagingPhone({
      whatsapp: "(15) 99799-2929",
      phone: "5515997992929",
    });
    expect(r.source).toBe("whatsapp");
    expect(r.normalizedPhone).toBe("5515997992929");
  });
  it("5. Telefone fixo (Sorocaba) → válido e usado", () => {
    const r = resolveLeadMessagingPhone({ whatsapp: null, phone: "1532269100" });
    expect(r.source).toBe("phone");
    expect(r.normalizedPhone).toBe("551532269100");
    expect(r.isValid).toBe(true);
  });
  it("6. Ambos vazios → missing_phone", () => {
    const r = resolveLeadMessagingPhone({ whatsapp: null, phone: null });
    expect(r.source).toBe("none");
    expect(r.verificationStatus).toBe("missing_phone");
    expect(r.isValid).toBe(false);
  });
  it("7. Ambos com lixo → phone_invalid", () => {
    const r = resolveLeadMessagingPhone({ whatsapp: "!!!", phone: "??" });
    expect(r.isValid).toBe(false);
    expect(r.verificationStatus).toBe("phone_invalid");
  });
  it("8. Preserva flag whatsappVerified do cache", () => {
    const r = resolveLeadMessagingPhone({
      whatsapp: "15997992929",
      phone: null,
      whatsappVerified: true,
    });
    expect(r.whatsappVerified).toBe(true);
  });
});

describe("formatPhoneForDisplay", () => {
  it("celular BR", () => {
    expect(formatPhoneForDisplay("5515997992929")).toBe("15 99799-2929");
  });
  it("fixo BR", () => {
    expect(formatPhoneForDisplay("551532269100")).toBe("15 3226-9100");
  });
});