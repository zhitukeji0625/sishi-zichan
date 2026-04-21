import { describe, it, expect, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidInTransaction } from "@/lib/auction";

function makeTx(mocks: {
  project: { status: string; startPrice: Decimal; bidStep: Decimal } | null;
  registration: {
    status: string;
    depositPaid: boolean;
  } | null;
  topBid: { amount: { toString(): string } } | null;
  createdBid?: { id: string; amount: Decimal };
}) {
  const auctionProjectFindUnique = vi.fn().mockResolvedValue(mocks.project);
  const auctionRegistrationFindUnique = vi.fn().mockResolvedValue(mocks.registration);
  const auctionBidFindFirst = vi.fn().mockResolvedValue(mocks.topBid);
  const auctionBidCreate = vi
    .fn()
    .mockImplementation(async ({ data }: { data: { amount: Decimal } }) => ({
      id: mocks.createdBid?.id ?? "bid-1",
      amount: data.amount,
    }));

  return {
    auctionProject: { findUnique: auctionProjectFindUnique },
    auctionRegistration: { findUnique: auctionRegistrationFindUnique },
    auctionBid: { findFirst: auctionBidFindFirst, create: auctionBidCreate },
    spies: { auctionBidCreate },
  } as const;
}

describe("placeBidInTransaction", () => {
  const projectId = "p1";
  const endUserId = "u1";

  const liveProject = {
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };

  const approvedReg = {
    status: "APPROVED",
    depositPaid: true,
  };

  it("accepts first bid at start price", async () => {
    const tx = makeTx({
      project: liveProject,
      registration: approvedReg,
      topBid: null,
    });

    const bid = await placeBidInTransaction(tx as never, {
      projectId,
      endUserId,
      amount: new Decimal(100),
    });

    expect(bid.amount.toString()).toBe("100");
    expect(tx.spies.auctionBidCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects bid below min increment", async () => {
    const tx = makeTx({
      project: liveProject,
      registration: approvedReg,
      topBid: { amount: { toString: () => "100" } },
    });

    await expect(
      placeBidInTransaction(tx as never, {
        projectId,
        endUserId,
        amount: new Decimal(105),
      }),
    ).rejects.toThrow();
    expect(tx.spies.auctionBidCreate).not.toHaveBeenCalled();
  });
});
