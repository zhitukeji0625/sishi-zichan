import { describe, it, expect } from "vitest";

describe("built-in data dictionary seed", () => {
  it("declares 14 categories for admin dict completeness", async () => {
    const { DICT_SEED_CATEGORY_COUNT } = await import("../../../prisma/seed-dict");
    expect(DICT_SEED_CATEGORY_COUNT).toBe(14);
  });
});
