import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateReservationRange } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateReservationRange", () => {
  let listingId: string;

  beforeAll(async () => {
    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    if (!listing) throw new Error("No operating drying listing in seed data");
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects end date before start date", async () => {
    const result = await validateReservationRange(
      listingId,
      new Date("2026-08-10"),
      new Date("2026-08-05"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("结束日期");
    }
  });
});
