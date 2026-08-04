import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    }),
  },
}));

import { acquireSlot, releaseSlot, __resetRateLimiter } from "../rate-limiter.server";

describe("rate-limiter", () => {
  beforeEach(() => __resetRateLimiter());

  it("adquire e libera slot", async () => {
    const r = await acquireSlot({ organization_id: "o", provider: "p" });
    expect(r.ok).toBe(true);
    await releaseSlot("o", "p");
  });

  it("bloqueia por concorrência", async () => {
    for (let i = 0; i < 3; i++) await acquireSlot({ organization_id: "o", provider: "q" });
    const r = await acquireSlot({ organization_id: "o", provider: "q", max_wait_ms: 50 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("concurrency");
  });
});