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

function setupTransaction(run: (tx: MockTx) => void) {
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: (tx: MockTx) => Promise<unknown>) => {
    const tx: MockTx = {
      auctionProject: { findUnique: vi.fn() },
      auctionRegistration: { findUnique: vi.fn() },
      auctionBid: { findFirst: vi.fn(), create: vi.fn() },
    };
    run(tx);
    return cb(tx);
  });
}

describe("placeBid", () => {
  const projectId = "proj-1";
  const endUserId = "user-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    setupTransaction((tx) => {
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
    });

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    setupTransaction((tx) => {
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
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
