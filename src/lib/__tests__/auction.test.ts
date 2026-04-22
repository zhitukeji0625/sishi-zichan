import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const projectId = "p-test";
const endUserId = "u-test";

const { mockTx, prismaMock } = vi.hoisted(() => {
  const mockTx = {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx as never),
    ),
  };
  return { mockTx, prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("placeBid", () => {
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
    mockTx.auctionBid.create.mockResolvedValue({
      id: "bid-1",
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
    expect(mockTx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId, endUserId, amount: expect.any(Decimal) },
    });
  });

  it("rejects bid below min increment", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow("出价需不低于");

    expect(mockTx.auctionBid.create).not.toHaveBeenCalled();
  });
});
