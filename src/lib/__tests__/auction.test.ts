import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockReset();
  });

  it("accepts first bid at start price", async () => {
    const tx = {
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
          amount: new Decimal(100),
        }),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
      (cb as (t: typeof tx) => Promise<unknown>)(tx),
    );

    const bid = await placeBid({
      projectId: "p1",
      endUserId: "u1",
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    const tx = {
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
        findFirst: vi.fn().mockResolvedValue({
          amount: new Decimal(100),
        }),
        create: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (cb) =>
      (cb as (t: typeof tx) => Promise<unknown>)(tx),
    );

    await expect(
      placeBid({ projectId: "p1", endUserId: "u1", amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
