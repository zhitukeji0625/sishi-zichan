import { describe, it, expect, beforeEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

/** In-memory Prisma-like store for placeBid() without a real DATABASE_URL. */
const auctionTestCtx = vi.hoisted(() => {
  type ProjectRow = {
    id: string;
    status: string;
    startPrice: Decimal;
    bidStep: Decimal;
  };
  type RegRow = {
    projectId: string;
    endUserId: string;
    status: string;
    depositPaid: boolean;
  };
  type BidRow = { id: string; projectId: string; endUserId: string; amount: Decimal };

  const state = {
    projects: new Map<string, ProjectRow>(),
    regs: new Map<string, RegRow>(),
    bids: [] as BidRow[],
  };

  function makeTx() {
    return {
      auctionProject: {
        findUnique: async ({ where: { id } }: { where: { id: string } }) =>
          state.projects.get(id) ?? null,
      },
      auctionRegistration: {
        findUnique: async ({
          where: { projectId_endUserId: keys },
        }: {
          where: { projectId_endUserId: { projectId: string; endUserId: string } };
        }) => state.regs.get(`${keys.projectId}:${keys.endUserId}`) ?? null,
      },
      auctionBid: {
        findFirst: async ({
          where: { projectId },
        }: {
          where: { projectId: string };
          orderBy: { amount: "desc" };
        }) => {
          const list = state.bids.filter((b) => b.projectId === projectId);
          if (list.length === 0) return null;
          return [...list].sort((a, b) =>
            new Decimal(b.amount.toString()).comparedTo(new Decimal(a.amount.toString())),
          )[0];
        },
        create: async ({
          data,
        }: {
          data: { projectId: string; endUserId: string; amount: Decimal };
        }) => {
          const row: BidRow = {
            id: `bid-${state.bids.length}`,
            projectId: data.projectId,
            endUserId: data.endUserId,
            amount: data.amount,
          };
          state.bids.push(row);
          return row;
        },
      },
    };
  }

  return {
    state,
    prisma: {
      $transaction: async <T>(fn: (tx: ReturnType<typeof makeTx>) => Promise<T>) =>
        fn(makeTx()),
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: auctionTestCtx.prisma,
}));

import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  const projectId = "proj-1";
  const endUserId = "user-1";

  beforeEach(() => {
    const s = auctionTestCtx.state;
    s.projects.clear();
    s.regs.clear();
    s.bids.length = 0;
    s.projects.set(projectId, {
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    s.regs.set(`${projectId}:${endUserId}`, {
      projectId,
      endUserId,
      status: "APPROVED",
      depositPaid: true,
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
