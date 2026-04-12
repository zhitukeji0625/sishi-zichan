import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

type MockTx = {
  auctionProject: { findUnique: ReturnType<typeof vi.fn> };
  auctionRegistration: { findUnique: ReturnType<typeof vi.fn> };
  auctionBid: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

function createTx(): MockTx {
  return {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
  };
}

let nextTx: MockTx;

beforeEach(() => {
  nextTx = createTx();
  vi.mocked(prisma.$transaction).mockImplementation(async (fn) => fn(nextTx));
});

describe("placeBid", () => {
  const projectId = "proj-1";
  const endUserId = "user-1";

  it("accepts first bid at start price", async () => {
    nextTx.auctionProject.findUnique.mockResolvedValue({
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    nextTx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
    nextTx.auctionBid.findFirst.mockResolvedValue(null);
    const created = { amount: new Decimal(100) };
    nextTx.auctionBid.create.mockResolvedValue(created);

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(nextTx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId, endUserId, amount: new Decimal(100) },
    });
  });

  it("rejects bid below min increment", async () => {
    nextTx.auctionProject.findUnique.mockResolvedValue({
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    nextTx.auctionRegistration.findUnique.mockResolvedValue({
      status: "APPROVED",
      depositPaid: true,
    });
    nextTx.auctionBid.findFirst.mockResolvedValue({
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(nextTx.auctionBid.create).not.toHaveBeenCalled();
  });
});
