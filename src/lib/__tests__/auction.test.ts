import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const prisma = new PrismaClient();
const skipDb = process.env.VITEST_SKIP_DB_TESTS === "1";

describe.skipIf(skipDb)("placeBid", () => {
  let orgId: string | undefined;
  let assetId: string | undefined;
  let projectId: string | undefined;
  let userId: string | undefined;

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "测试组织", code: `T${Date.now()}`, level: "COMPANY" },
    });
    orgId = org.id;
    const asset = await prisma.asset.create({
      data: {
        orgId,
        type: "LAND",
        name: "测试资产",
        locationText: "测试",
        status: "IDLE",
      },
    });
    assetId = asset.id;
    const user = await prisma.endUser.create({
      data: {
        phone: `199${Date.now().toString().slice(-8)}`,
        passwordHash: "x",
        name: "测试用户",
      },
    });
    userId = user.id;
    const project = await prisma.auctionProject.create({
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
    await prisma.auctionRegistration.create({
      data: {
        projectId,
        endUserId: userId,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  });

  afterAll(async () => {
    try {
      if (projectId) {
        await prisma.auctionBid.deleteMany({ where: { projectId } });
        await prisma.auctionRegistration.deleteMany({ where: { projectId } });
        await prisma.auctionProject.delete({ where: { id: projectId } });
      }
      if (assetId) await prisma.asset.delete({ where: { id: assetId } });
      if (userId) await prisma.endUser.delete({ where: { id: userId } });
      if (orgId) await prisma.organization.delete({ where: { id: orgId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("accepts first bid at start price", async () => {
    expect(projectId).toBeDefined();
    expect(userId).toBeDefined();
    const bid = await placeBid({
      projectId: projectId!,
      endUserId: userId!,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    expect(projectId).toBeDefined();
    expect(userId).toBeDefined();
    await expect(
      placeBid({ projectId: projectId!, endUserId: userId!, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
