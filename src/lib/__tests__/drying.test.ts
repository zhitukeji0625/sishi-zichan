import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { addDays, format } from "date-fns";
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
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("rejects dates beyond max advance days", async () => {
    const tooFar = addDays(new Date(), 10);
    const result = await validateBookingWindow(listingId, tooFar, tooFar);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("7");
  });

  it("rejects past start dates", async () => {
    const yesterday = addDays(new Date(), -1);
    const result = await validateBookingWindow(listingId, yesterday, yesterday);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("今天");
  });

  it("accepts valid range within window", async () => {
    const start = addDays(new Date(), 2);
    const end = addDays(new Date(), 3);
    const result = await validateBookingWindow(listingId, start, end);
    expect(result.ok).toBe(true);
    void format(start, "yyyy-MM-dd");
  });
});
