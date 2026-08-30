import { prisma } from "@/lib/prisma";

/** Advance auction project statuses by time (called from server layouts). */
export async function refreshAuctionProjectStatuses() {
  const now = new Date();
  await prisma.auctionProject.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    data: { status: "LIVE" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "ENDED" },
  });
}

/**
 * Reset ended demo auctions that have no signed contract so bidding can be tested again.
 * Called from root layout after status refresh.
 */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    select: {
      id: true,
      contracts: { where: { status: "SIGNED" }, select: { id: true }, take: 1 },
    },
  });
  const toReset = ended.filter((p) => p.contracts.length === 0);
  if (toReset.length === 0) return;

  const now = Date.now();
  const startsAt = new Date(now - 60_000);
  const endsAt = new Date(now + 7 * 24 * 60 * 60 * 1000);

  for (const { id } of toReset) {
    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: id } }),
      prisma.contract.deleteMany({ where: { auctionProjectId: id, status: { not: "SIGNED" } } }),
      prisma.auctionProject.update({
        where: { id },
        data: { status: "LIVE", startsAt, endsAt },
      }),
    ]);
  }
}
