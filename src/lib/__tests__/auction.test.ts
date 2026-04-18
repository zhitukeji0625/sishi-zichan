import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const databaseUrl = process.env.DATABASE_URL;
const prisma = databaseUrl ? new PrismaClient() : null;

describe.skipIf(!databaseUrl)("placeBid (integration)", () => {
  const db = prisma!;
  let orgId: string;
  let assetId: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: "测试组织", code: `T${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await db.asset.create({
      data: {
        orgId,
        type: "LAND",
        name: "测试资产",
        locationText: "测试",
        status: "IDLE",
      },
    });
    assetId = asset.id;
    const user = await db.endUser.create({
      data: {
        phone: `199${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "测试用户",
      },
    });
    userId = user.id;
    const project = await db.auctionProject.create({
      data: {
        code: `TAP${Date.now()}`,
        assetId,
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        depositAmount: new Decimal(5),
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 86400000),
        status: "LIVE",
      },
    });
    projectId = project.id;
    await db.auctionRegistration.create({
      data: {
        projectId,
        endUserId: userId,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  });

  afterAll(async () => {
    await db.auctionBid.deleteMany({ where: { projectId } });
    await db.auctionRegistration.deleteMany({ where: { projectId } });
    await db.auctionProject.delete({ where: { id: projectId } });
    await db.asset.delete({ where: { id: assetId } });
    await db.endUser.delete({ where: { id: userId } });
    await db.organization.delete({ where: { id: orgId } });
    await db.$disconnect();
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId,
      endUserId: userId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    await expect(
      placeBid({ projectId, endUserId: userId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
