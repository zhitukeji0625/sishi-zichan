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

function mockTx(): MockTx {
  return {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("placeBid", () => {
  it("accepts first bid at start price", async () => {
    const tx = mockTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    tx.auctionProject.findUnique.mockResolvedValue({
      id: "p1",
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    tx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
    tx.auctionBid.findFirst.mockResolvedValue(null);
    tx.auctionBid.create.mockResolvedValue({
      id: "b1",
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId: "p1", endUserId: "u1", amount: expect.any(Decimal) },
    });
  });

  it("rejects bid below min increment", async () => {
    const tx = mockTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never),
    );

    tx.auctionProject.findUnique.mockResolvedValue({
      id: "p1",
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    tx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
    tx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
