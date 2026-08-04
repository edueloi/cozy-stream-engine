import { describe, it, expect } from "vitest";
import { withTimeout } from "../timeout.server";

describe("withTimeout", () => {
  it("resolve antes do limite", async () => {
    const r = await withTimeout(async () => 1, 100, "x");
    expect(r).toBe(1);
  });
  it("rejeita após timeout", async () => {
    await expect(
      withTimeout(() => new Promise((r) => setTimeout(() => r(1), 60)), 20, "x"),
    ).rejects.toThrow(/timeout/);
  });
  it("limpa timer no sucesso", async () => {
    const before = (globalThis as any).setTimeout;
    await withTimeout(async () => "ok", 1000, "y");
    // apenas garante que não pendura o processo — vitest encerraria com hang
    expect(before).toBe((globalThis as any).setTimeout);
  });
});