import type { Prisma } from "@prisma/client";
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
  const projectId = "test-project";
  const endUserId = "test-user";
  let bids: Array<{ projectId: string; endUserId: string; amount: Decimal }>;

  beforeEach(() => {
    bids = [];
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
      const tx = {
        auctionProject: {
          findUnique: async () => ({
            status: "LIVE" as const,
            startPrice: new Decimal(100),
            bidStep: new Decimal(10),
          }),
        },
        auctionRegistration: {
          findUnique: async () => ({
            status: "APPROVED" as const,
            depositPaid: true,
          }),
        },
        auctionBid: {
          findFirst: async ({ where }: { where: { projectId: string } }) => {
            const list = bids.filter((b) => b.projectId === where.projectId);
            if (!list.length) return null;
            return list.reduce((a, b) => (a.amount.greaterThan(b.amount) ? a : b));
          },
          create: async ({
            data,
          }: {
            data: { projectId: string; endUserId: string; amount: Decimal };
          }) => {
            const row = { ...data };
            bids.push(row);
            return row;
          },
        },
      };
      return fn(tx as unknown as Prisma.TransactionClient);
    });
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    bids.push({ projectId, endUserId, amount: new Decimal(100) });
    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
