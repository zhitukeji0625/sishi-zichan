import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBidInTransaction } from "@/lib/auction";

function makeTx(mocks: {
  project: {
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  } | null;
  reg: { status: string; depositPaid: boolean } | null;
  topBid: { amount: Decimal } | null;
}) {
  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(
        mocks.project
          ? {
              id: "p1",
              status: mocks.project.status,
              startPrice: mocks.project.startPrice,
              bidStep: mocks.project.bidStep,
            }
          : null,
      ),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(
        mocks.reg
          ? {
              status: mocks.reg.status,
              depositPaid: mocks.reg.depositPaid,
            }
          : null,
      ),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(
        mocks.topBid
          ? { amount: mocks.topBid.amount }
          : null,
      ),
      create: vi.fn().mockImplementation(({ data }: { data: { amount: Decimal } }) =>
        Promise.resolve({ ...data, id: "bid1" }),
      ),
    },
  };
}

describe("placeBidInTransaction", () => {
  const projectId = "p1";
  const endUserId = "u1";

  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts first bid at start price", async () => {
    tx = makeTx({
      project: {
        status: "LIVE",
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      },
      reg: { status: "APPROVED", depositPaid: true },
      topBid: null,
    });
    const bid = await placeBidInTransaction(tx as never, {
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalledTimes(1);
  });

  it("rejects bid below min increment", async () => {
    tx = makeTx({
      project: {
        status: "LIVE",
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
      },
      reg: { status: "APPROVED", depositPaid: true },
      topBid: { amount: new Decimal(100) },
    });
    await expect(
      placeBidInTransaction(tx as never, {
        projectId,
        endUserId,
        amount: new Decimal(105),
      }),
    ).rejects.toThrow(/出价需不低于/);
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
