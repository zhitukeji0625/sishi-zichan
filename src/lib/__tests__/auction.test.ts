import { describe, it, expect, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import type { PrismaClient } from "@prisma/client";
import { minNextBidAmount, placeBid } from "@/lib/auction";

function mockTx(overrides: {
  project?: {
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  } | null;
  registration?: {
    status: string;
    depositPaid: boolean;
  } | null;
  topBid?: { amount: Decimal } | null;
  createdBid?: { amount: Decimal };
}) {
  const project = overrides.project ?? {
    status: "LIVE",
    startPrice: new Decimal(100),
    bidStep: new Decimal(10),
  };
  const registration = overrides.registration ?? {
    status: "APPROVED",
    depositPaid: true,
  };
  const createdBid = overrides.createdBid ?? { amount: new Decimal(100) };

  return {
    auctionProject: {
      findUnique: vi.fn().mockResolvedValue(project),
    },
    auctionRegistration: {
      findUnique: vi.fn().mockResolvedValue(registration),
    },
    auctionBid: {
      findFirst: vi.fn().mockResolvedValue(overrides.topBid ?? null),
      create: vi.fn().mockResolvedValue(createdBid),
    },
  };
}

function dbWithTx(tx: ReturnType<typeof mockTx>): PrismaClient {
  return {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
}

describe("minNextBidAmount", () => {
  it("uses start price when there is no prior bid", () => {
    expect(
      minNextBidAmount({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestAmount: null,
      }).toString(),
    ).toBe("100");
  });

  it("uses highest bid plus step when a bid exists", () => {
    expect(
      minNextBidAmount({
        startPrice: new Decimal(100),
        bidStep: new Decimal(10),
        highestAmount: new Decimal(200),
      }).toString(),
    ).toBe("210");
  });
});

describe("placeBid", () => {
  it("accepts first bid at start price", async () => {
    const tx = mockTx({ topBid: null });
    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
      db: dbWithTx(tx),
    });
    expect(bid.amount.toString()).toBe("100");
    expect(tx.auctionBid.create).toHaveBeenCalled();
  });

  it("rejects bid below min increment", async () => {
    const tx = mockTx({ topBid: { amount: new Decimal(100) } });
    await expect(
      placeBid({
        projectId: "p1",
        endUserId: "u1",
        amount: new Decimal(105),
        db: dbWithTx(tx),
      }),
    ).rejects.toThrow();
    expect(tx.auctionBid.create).not.toHaveBeenCalled();
  });
});
