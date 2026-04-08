import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const mockTx = {
  auctionProject: { findUnique: vi.fn() },
  auctionRegistration: { findUnique: vi.fn() },
  auctionBid: { findFirst: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async <T>(fn: (tx: typeof mockTx) => Promise<T>) => fn(mockTx),
  },
}));

import { placeBid } from "@/lib/auction";

describe("placeBid (unit)", () => {
  const projectId = "p1";
  const endUserId = "u1";

  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.auctionProject.findUnique.mockResolvedValue({
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    mockTx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
  });

  it("accepts first bid at start price", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValue(null);
    const created = {
      id: "b1",
      projectId,
      endUserId,
      amount: new Decimal(100),
    };
    mockTx.auctionBid.create.mockResolvedValue(created);

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(mockTx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId, endUserId, amount: expect.any(Decimal) },
    });
  });

  it("rejects bid below min increment when there is a top bid", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(mockTx.auctionBid.create).not.toHaveBeenCalled();
  });

  it("rejects when project is not LIVE", async () => {
    mockTx.auctionProject.findUnique.mockResolvedValue({
      id: projectId,
      status: "ENDED",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(100) }),
    ).rejects.toThrow("竞拍未在进行中");
  });
});
