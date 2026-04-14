import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const { mockTx, prismaMock } = vi.hoisted(() => {
  const mockTx = {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
    ),
  };
  return { mockTx, prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { placeBid, minNextBidAmount } from "@/lib/auction";

describe("minNextBidAmount", () => {
  it("first bid equals start price when there is no highest bid", () => {
    expect(
      minNextBidAmount({
        startPrice: 100,
        bidStep: 10,
        highestAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("next bid is highest plus step", () => {
    expect(
      minNextBidAmount({
        startPrice: 100,
        bidStep: 10,
        highestAmount: new Decimal(100),
      }).toString(),
    ).toBe("110");
  });
});

describe("placeBid", () => {
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
    const created = { amount: new Decimal(100) };
    mockTx.auctionBid.create.mockResolvedValue(created);

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(mockTx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId, endUserId, amount: new Decimal(100) },
    });
  });

  it("rejects bid below min increment", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(mockTx.auctionBid.create).not.toHaveBeenCalled();
  });
});
