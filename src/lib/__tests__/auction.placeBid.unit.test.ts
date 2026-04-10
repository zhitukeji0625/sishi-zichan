import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";

type MockTx = {
  auctionProject: { findUnique: ReturnType<typeof vi.fn> };
  auctionRegistration: { findUnique: ReturnType<typeof vi.fn> };
  auctionBid: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

function baseProject() {
  return {
    id: "p1",
    status: "LIVE" as const,
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };
}

function approvedReg() {
  return { status: "APPROVED" as const, depositPaid: true };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function runWithTx(tx: MockTx) {
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: (t: MockTx) => Promise<unknown>) =>
    cb(tx),
  );
}

describe("placeBid (unit, mocked prisma)", () => {
  it("accepts first bid at start price", async () => {
    const tx: MockTx = {
      auctionProject: { findUnique: vi.fn().mockResolvedValue(baseProject()) },
      auctionRegistration: { findUnique: vi.fn().mockResolvedValue(approvedReg()) },
      auctionBid: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ amount: new Decimal(100) }),
      },
    };
    runWithTx(tx);

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId: "p1", endUserId: "u1", amount: new Decimal(100) },
    });
  });

  it("rejects bid below min increment after a top bid exists", async () => {
    const tx: MockTx = {
      auctionProject: { findUnique: vi.fn().mockResolvedValue(baseProject()) },
      auctionRegistration: { findUnique: vi.fn().mockResolvedValue(approvedReg()) },
      auctionBid: {
        findFirst: vi.fn().mockResolvedValue({ amount: new Decimal(100) }),
        create: vi.fn(),
      },
    };
    runWithTx(tx);

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });

  it("throws when project is not LIVE", async () => {
    const tx: MockTx = {
      auctionProject: {
        findUnique: vi.fn().mockResolvedValue({ ...baseProject(), status: "DRAFT" }),
      },
      auctionRegistration: { findUnique: vi.fn() },
      auctionBid: { findFirst: vi.fn(), create: vi.fn() },
    };
    runWithTx(tx);

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(100) }),
    ).rejects.toThrow("竞拍未在进行中");
  });

  it("throws when user lacks approved registration or deposit", async () => {
    const tx: MockTx = {
      auctionProject: { findUnique: vi.fn().mockResolvedValue(baseProject()) },
      auctionRegistration: {
        findUnique: vi.fn().mockResolvedValue({ status: "PENDING", depositPaid: false }),
      },
      auctionBid: { findFirst: vi.fn(), create: vi.fn() },
    };
    runWithTx(tx);

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(100) }),
    ).rejects.toThrow("无出价资格");
  });
});
