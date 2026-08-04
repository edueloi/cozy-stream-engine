import { describe, it, expect } from "vitest";
import { sanitize } from "../sanitizer";

describe("sanitize", () => {
  it("remove raw/token/secret aninhados", () => {
    const input = {
      company: { name: "ACME", raw: { anything: 1 }, api_key: "x" },
      contacts: [{ email: "a@b.com", authorization: "Bearer x" }],
      decision_makers: [{ name: "X", response: { body: "sensitive" } }],
      headers: { cookie: "c" },
    };
    const out = sanitize(input) as any;
    expect(out.company.raw).toBeUndefined();
    expect(out.company.api_key).toBeUndefined();
    expect(out.company.name).toBe("ACME");
    expect(out.contacts[0].authorization).toBeUndefined();
    expect(out.contacts[0].email).toBe("a@b.com");
    expect(out.decision_makers[0].response).toBeUndefined();
    expect(out.headers).toBeUndefined();
  });
  it("preserva primitivos", () => {
    expect(sanitize(1)).toBe(1);
    expect(sanitize("s")).toBe("s");
    expect(sanitize(null)).toBe(null);
  });
});