import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateReservationRange } from "@/lib/drying";
import { addDays, format } from "date-fns";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateReservationRange", () => {
  let listingId: string;
  let assetId: string;
  let orgId: string;
  let blockerUserId: string;

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
        capacityRules: {
          create: {
            startDate: new Date("2026-01-01"),
            endDate: new Date("2027-12-31"),
            maxPeople: 1,
          },
        },
      },
    });
    listingId = listing.id;
    const user = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "占用用户",
      },
    });
    blockerUserId = user.id;
    const start = addDays(new Date(), 30);
    const end = addDays(start, 1);
    await prisma.dryingReservation.create({
      data: {
        listingId,
        endUserId: user.id,
        startDate: start,
        endDate: end,
        status: "APPROVED",
      },
    });
  });

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingCapacityRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.endUser.delete({ where: { id: blockerUserId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("rejects dates that overlap an existing booking at capacity", async () => {
    const occupied = await prisma.dryingReservation.findFirst({ where: { listingId } });
    expect(occupied).toBeTruthy();
    const result = await validateReservationRange(
      listingId,
      occupied!.startDate,
      occupied!.endDate,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/已满/);
    }
  });

  it("allows dates with no overlap", async () => {
    const start = addDays(new Date(), 60);
    const end = addDays(start, 1);
    const result = await validateReservationRange(listingId, start, end);
    expect(result).toEqual({ ok: true });
    void format(start, "yyyy-MM-dd");
  });
});
