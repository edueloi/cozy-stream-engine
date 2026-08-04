import { describe, it, expect } from "vitest";
import { nextFallback } from "../fallback.server";

describe("nextFallback", () => {
  it("retorna próximo não tentado", () => {
    expect(nextFallback(["a", "b", "c"], new Set(["a"]))).toBe("b");
  });
  it("ignora tentados", () => {
    expect(nextFallback(["a", "b"], new Set(["a", "b"]))).toBeNull();
  });
  it("null ao terminar", () => {
    expect(nextFallback([], new Set())).toBeNull();
  });
});