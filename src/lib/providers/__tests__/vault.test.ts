import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.PROVIDER_SECRET_MASTER_KEY = "test-master-key-for-vault-unit-tests-1234567890";
});

describe("vault", () => {
  it("round-trips a secret", async () => {
    const { sealSecret, openSecret } = await import("../vault.server");
    const sealed = sealSecret("sk_test_abc123");
    expect(openSecret(sealed)).toBe("sk_test_abc123");
  });

  it("last4 masks", async () => {
    const { last4 } = await import("../vault.server");
    expect(last4("abcdefgh1234")).toBe("1234");
  });

  it("reference is deterministic", async () => {
    const { makeReference } = await import("../vault.server");
    expect(makeReference("org-1", "casa_dos_dados")).toBe("org:org-1:provider:casa_dos_dados");
  });

  it("open fails with wrong auth tag", async () => {
    const { sealSecret, openSecret } = await import("../vault.server");
    const s = sealSecret("value");
    s.authTag[0] = s.authTag[0] ^ 0xff;
    expect(() => openSecret(s)).toThrow();
  });
});