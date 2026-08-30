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
 * Reset ENDED demo auctions without a signed contract back to LIVE so cron
 * smoke tests can exercise bidding. Clears unpublished results.
 */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      result: true,
      contracts: { where: { status: "SIGNED" }, take: 1 },
    },
  });
  const now = Date.now();
  for (const project of ended) {
    if (project.contracts.length > 0) continue;
    await prisma.auctionResult.deleteMany({ where: { projectId: project.id } });
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: {
        status: "LIVE",
        startsAt: new Date(now - 60_000),
        endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
