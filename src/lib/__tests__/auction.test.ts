import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid, validateBidRules } from "@/lib/auction";

describe("validateBidRules", () => {
  const liveProject = {
    status: "LIVE",
    startPrice: new Decimal("100"),
    bidStep: new Decimal("10"),
  };
  const approvedReg = { status: "APPROVED", depositPaid: true as boolean };

  it("accepts first bid at start price", () => {
    expect(() =>
      validateBidRules({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: null,
        amount: new Decimal("100"),
      }),
    ).not.toThrow();
  });

  it("rejects bid below minimum next amount when prior bid exists", () => {
    expect(() =>
      validateBidRules({
        project: liveProject,
        registration: approvedReg,
        highestBidAmount: new Decimal("100"),
        amount: new Decimal("105"),
      }),
    ).toThrow();
  });

  it("rejects when project is not LIVE", () => {
    expect(() =>
      validateBidRules({
        project: { ...liveProject, status: "ENDED" },
        registration: approvedReg,
        highestBidAmount: null,
        amount: new Decimal("100"),
      }),
    ).toThrow("竞拍未在进行中");
  });

  it("rejects when registration missing", () => {
    expect(() =>
      validateBidRules({
        project: liveProject,
        registration: null,
        highestBidAmount: null,
        amount: new Decimal("100"),
      }),
    ).toThrow("无出价资格");
  });
});

const prisma = new PrismaClient();

let dbUp = false;
try {
  await prisma.$connect();
  dbUp = true;
} catch {
  await prisma.$disconnect().catch(() => undefined);
}

describe.skipIf(!dbUp)("placeBid", () => {
  let orgId: string;
  let assetId: string;
  let projectId: string;
  let userId: string;

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
    await prisma.auctionBid.deleteMany({ where: { projectId } });
    await prisma.auctionRegistration.deleteMany({ where: { projectId } });
    await prisma.auctionProject.delete({ where: { id: projectId } });
    await prisma.asset.delete({ where: { id: assetId } });
    await prisma.endUser.delete({ where: { id: userId } });
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.$disconnect();
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
