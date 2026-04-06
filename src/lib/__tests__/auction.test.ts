import { describe, it, expect, vi, beforeAll } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

type BidRow = { id: string; projectId: string; endUserId: string; amount: Decimal };
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

function createTestStore() {
  const projects = new Map<string, ProjectRow>();
  const registrations = new Map<string, RegRow>();
  const bids: BidRow[] = [];

  const regKey = (projectId: string, endUserId: string) => `${projectId}:${endUserId}`;

  const tx = {
    auctionProject: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        projects.get(where.id) ?? null,
    },
    auctionRegistration: {
      findUnique: async ({
        where,
      }: {
        where: { projectId_endUserId: { projectId: string; endUserId: string } };
      }) =>
        registrations.get(
          regKey(where.projectId_endUserId.projectId, where.projectId_endUserId.endUserId),
        ) ?? null,
    },
    auctionBid: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { projectId: string };
        orderBy: { amount: "desc" };
      }) => {
        const list = bids.filter((b) => b.projectId === where.projectId);
        if (orderBy.amount !== "desc") return null;
        return list.reduce<BidRow | null>((best, b) => {
          if (!best || b.amount.greaterThan(best.amount)) return b;
          return best;
        }, null);
      },
      create: async ({
        data,
      }: {
        data: { projectId: string; endUserId: string; amount: Decimal };
      }) => {
        const row: BidRow = {
          id: `bid-${bids.length + 1}`,
          projectId: data.projectId,
          endUserId: data.endUserId,
          amount: data.amount,
        };
        bids.push(row);
        return row;
      },
    },
  };

  return { projects, registrations, bids, tx };
}

const { store } = vi.hoisted(() => ({ store: createTestStore() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async <T>(fn: (tx: typeof store.tx) => Promise<T>) => fn(store.tx),
  },
}));

import { placeBid } from "@/lib/auction";

describe("placeBid", () => {
  let projectId: string;
  let userId: string;

  beforeAll(() => {
    projectId = "proj-1";
    userId = "user-1";
    store.projects.clear();
    store.registrations.clear();
    store.bids.length = 0;
    store.projects.set(projectId, {
      id: projectId,
      status: "LIVE",
      startPrice: new Decimal(100),
      bidStep: new Decimal(10),
    });
    store.registrations.set(`${projectId}:${userId}`, {
      projectId,
      endUserId: userId,
      status: "APPROVED",
      depositPaid: true,
    });
  });

  it("accepts first bid at start price", async () => {
    const bid = await placeBid({
      projectId,
      endUserId: userId,
      amount: new Decimal(100),
    });
    expect(bid.amount.toString()).toBe("100");
  });

  it("rejects bid below min increment", async () => {
    await expect(
      placeBid({ projectId, endUserId: userId, amount: new Decimal(105) }),
    ).rejects.toThrow();
  });
});
