import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const mockTx = {
  auctionProject: { findUnique: vi.fn() },
  auctionRegistration: { findUnique: vi.fn() },
  auctionBid: { findFirst: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
    ),
  },
}));

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.auctionProject.findUnique.mockResolvedValue({
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
    const created = { id: "bid-1", amount: new Decimal(100) };
    mockTx.auctionBid.create.mockResolvedValue(created);

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(mockTx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId: "p1", endUserId: "u1", amount: new Decimal(100) },
    });
  });

  it("rejects bid below min increment", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValue({ amount: new Decimal(100) });

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
