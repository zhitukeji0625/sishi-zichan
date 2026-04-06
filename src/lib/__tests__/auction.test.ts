import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const { mockTx } = vi.hoisted(() => ({
  mockTx: {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  },
}));

describe("placeBid", () => {
  const projectId = "test-project";
  const userId = "test-user";

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
    mockTx.auctionBid.create.mockImplementation(async ({ data }) => ({
      ...data,
      id: "bid-1",
    }));

    const bid = await placeBid({
      projectId,
      endUserId: userId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    mockTx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId: userId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
