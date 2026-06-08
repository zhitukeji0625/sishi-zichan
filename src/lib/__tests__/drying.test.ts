import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays } from "date-fns";
import { validateBookingWindow } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateBookingWindow", () => {
  let listingId: string;
  let orgId: string;
  let assetId: string;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "晒场测试组织", code: `D${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "DRYING_FIELD",
        name: "测试晒场",
        locationText: "测试",
        status: "IN_USE",
      },
    });
    assetId = asset.id;
    const listing = await prisma.dryingFieldListing.create({
      data: {
        assetId,
        status: "OPERATING",
        bookingRules: { create: { maxAdvanceDays: 7 } },
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingBookingRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("rejects dates beyond maxAdvanceDays", async () => {
    const far = addDays(new Date(), 60);
    const result = await validateBookingWindow(listingId, far, far);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("7");
    }
  });

  it("accepts dates within maxAdvanceDays", async () => {
    const start = addDays(new Date(), 2);
    const end = addDays(new Date(), 3);
    const result = await validateBookingWindow(listingId, start, end);
    expect(result.ok).toBe(true);
  });

  it("rejects start date before today", async () => {
    const yesterday = addDays(new Date(), -1);
    const result = await validateBookingWindow(listingId, yesterday, yesterday);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("今天");
    }
  });
});
