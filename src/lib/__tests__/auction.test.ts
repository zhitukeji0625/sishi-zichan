import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const ctx = vi.hoisted(() => ({
  bids: [] as Array<{
    projectId: string;
    endUserId: string;
    amount: Decimal;
  }>,
}));

vi.mock("@/lib/prisma", () => {
  const project = {
    id: "p1",
    status: "LIVE" as const,
    startPrice: { toString: () => "100" },
    bidStep: { toString: () => "10" },
  };

  const registration = {
    status: "APPROVED" as const,
    depositPaid: true,
  };

  function buildTx() {
    return {
      auctionProject: {
        findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) =>
          id === "p1" ? project : null,
        ),
      },
      auctionRegistration: {
        findUnique: vi.fn(
          async ({
            where: { projectId_endUserId },
          }: {
            where: { projectId_endUserId: { projectId: string; endUserId: string } };
          }) =>
            projectId_endUserId.projectId === "p1" &&
            projectId_endUserId.endUserId === "u1"
              ? registration
              : null,
        ),
      },
      auctionBid: {
        findFirst: vi.fn(
          async ({
            where: { projectId },
          }: {
            where: { projectId: string };
            orderBy: { amount: string };
          }) => {
            const list = ctx.bids.filter((b) => b.projectId === projectId);
            if (!list.length) return null;
            let top = list[0];
            for (const b of list) {
              if (b.amount.greaterThan(top.amount)) top = b;
            }
            return { amount: top.amount };
          },
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: { projectId: string; endUserId: string; amount: Decimal };
          }) => {
            ctx.bids.push(data);
            return data;
          },
        ),
      },
    };
  }

  return {
    prisma: {
      $transaction: vi.fn(
        async (fn: (tx: ReturnType<typeof buildTx>) => Promise<unknown>) =>
          fn(buildTx()),
      ),
    },
  };
});

import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  const projectId = "p1";
  const endUserId = "u1";

  beforeEach(() => {
    ctx.bids.length = 0;
    vi.clearAllMocks();
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
    await placeBid({
      projectId,
      endUserId,
      amount: new Decimal(100),
    });
    await expect(
      placeBid({ projectId, endUserId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
