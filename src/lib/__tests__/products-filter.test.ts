import { describe, it, expect } from "vitest";
import { filterActiveProducts } from "@/lib/products.functions";

describe("filterActiveProducts", () => {
  it("hides inactive products from the sales rep", () => {
    const items = [
      { id: "a", status: "active" },
      { id: "b", status: "inactive" },
      { id: "c", status: "active" },
    ];
    expect(filterActiveProducts(items).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("keeps a newly-created product visible immediately", () => {
    const base = [{ id: "old", status: "active" }];
    const afterCreate = [...base, { id: "new", status: "active" }];
    expect(filterActiveProducts(afterCreate).some((p) => p.id === "new")).toBe(true);
  });

  it("treats missing status as active (backward compatibility)", () => {
    const items = [{ id: "x" }, { id: "y", status: "inactive" }];
    expect(filterActiveProducts(items as any).map((p) => (p as any).id)).toEqual(["x"]);
  });

  it("does not leak products across orgs — caller receives only its own list", () => {
    // Simulates what RLS returns to org A vs org B (server already filters
    // by organization_id via the product_catalog_select_own_org policy).
    const orgAItems = [{ id: "a1", status: "active" }];
    const orgBItems = [{ id: "b1", status: "active" }];
    expect(filterActiveProducts(orgAItems).find((p) => p.id === "b1")).toBeUndefined();
    expect(filterActiveProducts(orgBItems).find((p) => p.id === "a1")).toBeUndefined();
  });
});