import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const tx = {
  auctionProject: { findUnique: vi.fn() },
  auctionRegistration: { findUnique: vi.fn() },
  auctionBid: { findFirst: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}));

describe("placeBid", () => {
  const projectId = "p1";
  const endUserId = "u1";

  beforeEach(() => {
    vi.clearAllMocks();
    tx.auctionProject.findUnique.mockResolvedValue({
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    tx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
  });

  it("accepts first bid at start price", async () => {
    tx.auctionBid.findFirst.mockResolvedValue(null);
    const created = { id: "b1", projectId, endUserId, amount: new Decimal(100) };
    tx.auctionBid.create.mockResolvedValue(created);

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId, endUserId, amount: expect.any(Decimal) },
    });
  });

  it("rejects bid below min increment", async () => {
    tx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
