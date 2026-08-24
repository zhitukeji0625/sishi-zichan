import { prisma } from "@/lib/prisma";

/**
 * Keep demo auction projects usable for recurring tests: reset ENDED projects
 * that are not locked by signed contracts back to LIVE with fresh dates.
 */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: {
      status: "ENDED",
      contracts: { none: { status: "SIGNED" } },
    },
    select: { id: true },
  });

  if (ended.length === 0) return;

  const ids = ended.map((p) => p.id);
  await prisma.auctionResult.deleteMany({ where: { projectId: { in: ids } } });
  await prisma.auctionBid.deleteMany({ where: { projectId: { in: ids } } });

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.updateMany({
    where: { id: { in: ids } },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
