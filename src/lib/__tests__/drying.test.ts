import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateReservationRange } from "@/lib/drying";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("validateReservationRange", () => {
  let listingId: string;
  let assetId: string;
  let orgId: string;

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
            maxPeople: 2,
          },
        },
      },
    });
    listingId = listing.id;
  });

  afterAll(async () => {
    await prisma.dryingReservation.deleteMany({ where: { listingId } });
    await prisma.dryingCapacityRule.deleteMany({ where: { listingId } });
    await prisma.dryingFieldListing.delete({ where: { id: listingId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it("allows booking when capacity available", async () => {
    const result = await validateReservationRange(
      listingId,
      new Date("2026-07-01"),
      new Date("2026-07-02"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects when day is full", async () => {
    const day = new Date("2026-08-01");
    const userA = await prisma.endUser.create({
      data: { phone: `198${Date.now().toString().slice(-8)}`, passwordHash: "x", name: "A" },
    });
    const userB = await prisma.endUser.create({
      data: { phone: `197${Date.now().toString().slice(-8)}`, passwordHash: "x", name: "B" },
    });
    await prisma.dryingReservation.createMany({
      data: [
        { listingId, endUserId: userA.id, startDate: day, endDate: day, status: "APPROVED" },
        { listingId, endUserId: userB.id, startDate: day, endDate: day, status: "PENDING_REVIEW" },
      ],
    });
    const result = await validateReservationRange(listingId, day, day);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("已满");
    await prisma.dryingReservation.deleteMany({
      where: { endUserId: { in: [userA.id, userB.id] } },
    });
    await prisma.endUser.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });
});
