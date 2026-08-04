import { describe, it, expect } from "vitest";
import { guardUrl, guardHeaders } from "../ssrf-guard.server";

describe("guardUrl", () => {
  it("blocks http", () => expect(guardUrl("http://example.com").ok).toBe(false));
  it("blocks localhost", () => expect(guardUrl("https://localhost/x").ok).toBe(false));
  it("blocks 127.0.0.1", () => expect(guardUrl("https://127.0.0.1/x").ok).toBe(false));
  it("blocks 10/8", () => expect(guardUrl("https://10.0.0.1/x").ok).toBe(false));
  it("blocks 192.168/16", () => expect(guardUrl("https://192.168.1.1/x").ok).toBe(false));
  it("blocks 169.254 metadata", () => expect(guardUrl("https://169.254.169.254/x").ok).toBe(false));
  it("blocks IPv6 loopback", () => expect(guardUrl("https://[::1]/x").ok).toBe(false));
  it("allows public https", () => expect(guardUrl("https://api.example.com/v1").ok).toBe(true));
});

describe("guardHeaders", () => {
  it("blocks Host override", () => expect(guardHeaders({ Host: "evil.tld" }).ok).toBe(false));
  it("blocks Cookie", () => expect(guardHeaders({ cookie: "x=1" }).ok).toBe(false));
  it("allows benign headers", () => expect(guardHeaders({ "X-Client": "jcs" }).ok).toBe(true));
});