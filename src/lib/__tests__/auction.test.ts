import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";
import { prisma } from "@/lib/prisma";

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
    $transaction: vi.fn(async (fn: (t: typeof mockTx) => unknown) => fn(mockTx)),
  },
}));

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
      projectId,
      endUserId,
      status: "APPROVED",
      depositPaid: true,
    });
  });

  it("accepts first bid at start price", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValueOnce(null);
    mockTx.auctionBid.create.mockResolvedValueOnce({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("rejects bid below min increment after a leading bid", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValueOnce({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
    expect(mockTx.auctionBid.create).not.toHaveBeenCalled();
  });
});
