import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { placeBid } from "@/lib/auction";

function mockTx(input: {
  projectId: string;
  endUserId: string;
  startPrice: Decimal;
  bidStep: Decimal;
  existingTop?: Decimal;
}): Prisma.TransactionClient {
  const bids: { projectId: string; endUserId: string; amount: Decimal }[] = [];
  if (input.existingTop) {
    bids.push({
      projectId: input.projectId,
      endUserId: "other",
      amount: input.existingTop,
    });
  }

  return {
    auctionProject: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === input.projectId
          ? {
              id: input.projectId,
              status: "LIVE",
              startPrice: input.startPrice,
              bidStep: input.bidStep,
            }
          : null,
    },
    auctionRegistration: {
      findUnique: async ({
        where: { projectId_endUserId: keys },
      }: {
        where: { projectId_endUserId: { projectId: string; endUserId: string } };
      }) =>
        keys.projectId === input.projectId && keys.endUserId === input.endUserId
          ? {
              projectId: keys.projectId,
              endUserId: keys.endUserId,
              status: "APPROVED",
              depositPaid: true,
            }
          : null,
    },
    auctionBid: {
      findFirst: async ({
        where: { projectId },
      }: {
        where: { projectId: string };
        orderBy: { amount: "desc" };
      }) => {
        const list = bids.filter((b) => b.projectId === projectId);
        if (list.length === 0) return null;
        return list.reduce((a, b) => (a.amount.greaterThan(b.amount) ? a : b));
      },
      create: async ({
        data,
      }: {
        data: { projectId: string; endUserId: string; amount: Decimal };
      }) => {
        bids.push(data);
        return { id: `bid-${bids.length}`, ...data };
      },
    },
  } as unknown as Prisma.TransactionClient;
}

describe("placeBid", () => {
  const projectId = "p1";
  const endUserId = "u1";

  it("accepts first bid at start price", async () => {
    const tx = mockTx({
      projectId,
      endUserId,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    const bid = await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
      tx,
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    const tx = mockTx({
      projectId,
      endUserId,
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
      existingTop: new Decimal(100),
    });
    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105), tx }),
    ).rejects.toThrow();
  });
});
