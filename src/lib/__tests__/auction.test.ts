import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const tx = {
  auctionProject: { findUnique: vi.fn() },
  auctionRegistration: { findUnique: vi.fn() },
  auctionBid: { findFirst: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  const projectId = "proj-test";
  const endUserId = "user-test";

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
    tx.auctionBid.findFirst.mockResolvedValueOnce(null);
    tx.auctionBid.create.mockResolvedValueOnce({ amount: new Decimal(100) });

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    tx.auctionBid.findFirst.mockResolvedValueOnce({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
