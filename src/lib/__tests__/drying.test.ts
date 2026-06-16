import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { checkUserReservationOverlap, validateReservationRange } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("drying reservations", () => {
  let orgId: string;
  let assetId: string;
  let listingId: string;
  let userId: string;
  let reservationId: string;

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
      data: { assetId, status: "OPERATING" },
    });
    listingId = listing.id;
    const user = await prisma.endUser.create({
      data: {
        phone: `198${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "晒场测试用户",
      },
    });
    userId = user.id;
    const res = await prisma.dryingReservation.create({
      data: {
        listingId,
        endUserId: userId,
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-03"),
        status: "PENDING_REVIEW",
      },
    });
    reservationId = res.id;
  });

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.endUser.delete({ where: { id: userId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("rejects overlapping reservation for same user", async () => {
    const result = await checkUserReservationOverlap(
      listingId,
      userId,
      new Date("2026-08-02"),
      new Date("2026-08-04"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("重叠");
  });

  it("allows non-overlapping reservation for same user", async () => {
    const result = await checkUserReservationOverlap(
      listingId,
      userId,
      new Date("2026-08-10"),
      new Date("2026-08-12"),
    );
    expect(result.ok).toBe(true);
  });

  it("validates capacity for date range", async () => {
    const result = await validateReservationRange(
      listingId,
      new Date("2026-08-10"),
      new Date("2026-08-12"),
    );
    expect(result.ok).toBe(true);
  });
});
