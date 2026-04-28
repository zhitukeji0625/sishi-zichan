import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const projectId = "proj-1";
const endUserId = "user-1";

const liveProject = {
  id: projectId,
  status: "LIVE" as const,
  startPrice: new Decimal(100),
  bidStep: new Decimal(10),
};

const approvedReg = {
  projectId,
  endUserId,
  status: "APPROVED" as const,
  depositPaid: true,
};

function createTx(topBid: { amount: Decimal } | null) {
  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(liveProject),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(approvedReg),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(topBid),
      create: vi.fn().mockImplementation(
        ({ data }: { data: { amount: Decimal } }) =>
          Promise.resolve({
            ...data,
            id: "bid-1",
            projectId,
            endUserId,
          }),
      ),
    },
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    const tx = createTx(null);
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) =>
      fn(tx as never),
    );

    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalled();
  });

  it("rejects bid below min increment", async () => {
    const tx = createTx({ amount: new Decimal(100) });
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) =>
      fn(tx as never),
    );

    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
