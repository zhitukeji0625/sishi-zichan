import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const mockTx = {
      auctionProject: {
        findUnique: vi.fn().mockResolvedValue({
          id: "p1",
          status: "LIVE",
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
        }),
      },
      auctionRegistration: {
        findUnique: vi.fn().mockResolvedValue({
          status: "APPROVED",
          depositPaid: true,
        }),
      },
      auctionBid: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "b1",
          projectId: "p1",
          endUserId: "u1",
          amount: new Decimal(100),
        }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(mockTx as never),
    );

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(mockTx.auctionBid.create).toHaveBeenCalled();
  });

  it("rejects bid below min increment", async () => {
    const mockTx = {
      auctionProject: {
        findUnique: vi.fn().mockResolvedValue({
          id: "p1",
          status: "LIVE",
          startPrice: new Decimal(100),
          bidStep: new Decimal(10),
        }),
      },
      auctionRegistration: {
        findUnique: vi.fn().mockResolvedValue({
          status: "APPROVED",
          depositPaid: true,
        }),
      },
      auctionBid: {
        findFirst: vi.fn().mockResolvedValue({ amount: new Decimal(100) }),
        create: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      fn(mockTx as never),
    );

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow();
    expect(mockTx.auctionBid.create).not.toHaveBeenCalled();
  });
});
