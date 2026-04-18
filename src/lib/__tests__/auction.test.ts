import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { placeBid } from "@/lib/auction";

type Tx = {
  auctionProject: { findUnique: ReturnType<typeof vi.fn> };
  auctionRegistration: { findUnique: ReturnType<typeof vi.fn> };
  auctionBid: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

function mockTx(overrides: Partial<Tx> = {}): Tx {
  return {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
    ...overrides,
  };
}

describe("placeBid", () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
  });

  it("accepts first bid at start price", async () => {
    const projectId = "p1";
    const endUserId = "u1";
    const tx = mockTx();
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
    tx.auctionBid.findFirst.mockResolvedValue(null);
    tx.auctionBid.create.mockResolvedValue({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (t: Tx) => Promise<unknown>) =>
      fn(tx),
    );

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    const projectId = "p1";
    const endUserId = "u1";
    const tx = mockTx();
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
    tx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (t: Tx) => Promise<unknown>) =>
      fn(tx),
    );

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
  });
});
