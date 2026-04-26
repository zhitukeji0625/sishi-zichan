import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

const mocks = vi.hoisted(() => {
  const tx = {
    auctionProject: { findUnique: vi.fn() },
    auctionRegistration: { findUnique: vi.fn() },
    auctionBid: { findFirst: vi.fn(), create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(
        (callback: (t: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

describe("placeBid", () => {
  const projectId = "proj-1";
  const endUserId = "user-1";

  const liveProject = {
    id: projectId,
    status: "LIVE" as const,
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  const approvedReg = {
    status: "APPROVED" as const,
    depositPaid: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((callback) =>
      callback(mocks.tx),
    );
  });

  it("accepts first bid at start price", async () => {
    mocks.tx.auctionProject.findUnique.mockResolvedValue(liveProject);
    mocks.tx.auctionRegistration.findUnique.mockResolvedValue(approvedReg);
    mocks.tx.auctionBid.findFirst.mockResolvedValue(null);
    mocks.tx.auctionBid.create.mockResolvedValue({
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
    expect(mocks.tx.auctionBid.create).toHaveBeenCalledWith({
      data: { projectId, endUserId, amount: expect.any(Decimal) },
    });
  });

  it("rejects bid below min increment", async () => {
    mocks.tx.auctionProject.findUnique.mockResolvedValue(liveProject);
    mocks.tx.auctionRegistration.findUnique.mockResolvedValue(approvedReg);
    mocks.tx.auctionBid.findFirst.mockResolvedValue({
      id: "prev",
      projectId,
      endUserId: "other",
      amount: new Decimal(100),
    });

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);

    expect(mocks.tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
