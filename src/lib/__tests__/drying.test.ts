import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays, format } from "date-fns";
import { validateReservationRange } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateReservationRange", () => {
  let listingId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晒场测试组织", code: `D${Date.now()}`, level: "COMPANY" },
    });
    const asset = await prisma.asset.create({
      data: {
        orgId: org.id,
        type: "DRYING_FIELD",
        name: "测试晒场",
        locationText: "测试",
        status: "IN_USE",
      },
    });
    const listing = await prisma.dryingFieldListing.create({
      data: {
        assetId: asset.id,
        status: "OPERATING",
        bookingRules: { create: { maxAdvanceDays: 7 } },
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    const listing = await prisma.dryingFieldListing.findUnique({ where: { id: listingId } });
    if (listing) {
      await prisma.dryingBookingRule.deleteMany({ where: { listingId } });
      await prisma.dryingCapacityRule.deleteMany({ where: { listingId } });
      await prisma.dryingFieldListing.delete({ where: { id: listingId } });
      await prisma.asset.delete({ where: { id: listing.assetId } });
    }
    await prisma.$disconnect();
  });

  it("rejects dates beyond maxAdvanceDays", async () => {
    const start = addDays(new Date(), 30);
    const end = addDays(new Date(), 32);
    const result = await validateReservationRange(listingId, start, end);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("7");
    }
  });

  it("accepts dates within maxAdvanceDays", async () => {
    const start = addDays(new Date(), 2);
    const end = addDays(new Date(), 3);
    const result = await validateReservationRange(listingId, start, end);
    expect(result.ok).toBe(true);
  });
});
