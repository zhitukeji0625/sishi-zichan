import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const { mockTx } = vi.hoisted(() => {
  const mockTx = {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
  };
  return { mockTx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: <T>(fn: (tx: typeof mockTx) => Promise<T>) => fn(mockTx),
  },
}));

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    mockTx.auctionProject.findUnique.mockResolvedValue({
      id: "p1",
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    mockTx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
    mockTx.auctionBid.findFirst.mockResolvedValue(null);
    mockTx.auctionBid.create.mockResolvedValue({
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
    expect(mockTx.auctionBid.create).toHaveBeenCalledTimes(1);
  });

  it("rejects bid below min increment", async () => {
    mockTx.auctionProject.findUnique.mockResolvedValue({
      id: "p1",
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    mockTx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
    mockTx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow();
    expect(mockTx.auctionBid.create).not.toHaveBeenCalled();
  });
});
