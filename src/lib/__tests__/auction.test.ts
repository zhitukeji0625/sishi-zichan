import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid, placeBidWithClient } from "@/lib/auction";
import { prisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL);

function makeMockTx(params: {
  project: { id: string; status: string; startPrice: Decimal; bidStep: Decimal };
  reg: { status: string; depositPaid: boolean } | null;
  topBid: { amount: Decimal } | null;
}) {
  const { project, reg, topBid } = params;
  return {
    auctionProject: {
      findUnique: vi.fn(async () =>
        project.status === "LIVE"
          ? {
              id: project.id,
              status: project.status,
              startPrice: project.startPrice,
              bidStep: project.bidStep,
            }
          : null,
      ),
    },
    auctionRegistration: {
      findUnique: vi.fn(async () =>
        reg
          ? {
              status: reg.status,
              depositPaid: reg.depositPaid,
            }
          : null,
      ),
    },
    auctionBid: {
      findFirst: vi.fn(async () => topBid),
      create: vi.fn(async ({ data }: { data: { amount: Decimal } }) => ({
        id: "mock-bid-id",
        ...data,
      })),
    },
  } as unknown as Prisma.TransactionClient;
}

describe.skipIf(hasDatabase)("placeBidWithClient（无 DATABASE_URL 时使用 mock）", () => {
  const projectId = "p1";
  const endUserId = "u1";
  const baseProject = {
    id: projectId,
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  it("首笔出价等于起拍价时通过", async () => {
    const tx = makeMockTx({
      project: baseProject,
      reg: { status: "APPROVED", depositPaid: true },
      topBid: null,
    });
    const bid = await placeBidWithClient(tx, {
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("低于最小加价时拒绝", async () => {
    const tx = makeMockTx({
      project: baseProject,
      reg: { status: "APPROVED", depositPaid: true },
      topBid: { amount: new Decimal(100) },
    });
    await expect(
      placeBidWithClient(tx, {
        projectId,
        endUserId,
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
  });
});

describe.skipIf(!hasDatabase)("placeBid（集成，需 DATABASE_URL）", () => {
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
