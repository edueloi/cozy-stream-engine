import { describe, it, expect } from "vitest";
import { classifyError, maxAttemptsFor } from "../error-classifier";

describe("error-classifier", () => {
  it("timeout → retryable", () => {
    expect(classifyError(new Error("operation timeout after 15000ms")).category).toBe("retryable");
  });
  it("network → retryable", () => {
    expect(classifyError(new Error("fetch failed")).category).toBe("retryable");
  });
  it("HTTP 429 → retryable", () => {
    const c = classifyError({ status: 429, message: "too many" });
    expect(c.category).toBe("retryable"); expect(c.status).toBe(429);
  });
  it("HTTP 500 → retryable", () => {
    expect(classifyError({ status: 500 }).category).toBe("retryable");
  });
  it("HTTP 400 → terminal", () => {
    expect(classifyError({ status: 400 }).category).toBe("terminal");
  });
  it("HTTP 401 → terminal", () => {
    expect(classifyError({ status: 401 }).category).toBe("terminal");
  });
  it("HTTP 404 → terminal", () => {
    expect(classifyError({ status: 404 }).category).toBe("terminal");
  });
  it("invalid_credentials → terminal", () => {
    expect(classifyError(new Error("invalid_credentials")).category).toBe("terminal");
  });
  it("unknown → unknown", () => {
    expect(classifyError(new Error("weird thing")).category).toBe("unknown");
  });
  it("Retry-After em segundos vira ms", () => {
    const c = classifyError({ status: 429, retry_after: "2" });
    expect(c.retry_after_ms).toBe(2000);
  });
  it("maxAttemptsFor", () => {
    expect(maxAttemptsFor("retryable")).toBe(3);
    expect(maxAttemptsFor("unknown")).toBe(2);
    expect(maxAttemptsFor("terminal")).toBe(1);
  });
});