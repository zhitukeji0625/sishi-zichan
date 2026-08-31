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

/** Reset ended demo auctions (no signed contract) so cron/dev smoke tests can bid. */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: { contracts: { where: { status: "SIGNED" } } },
  });
  for (const project of ended) {
    if (project.contracts.length > 0) continue;
    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
  }
}
