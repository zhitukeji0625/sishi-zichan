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
 * Reset demo auctions that ended without a signed contract so cron smoke tests
 * and manual demos keep a LIVE project available.
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

  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  for (const project of toReset) {
    await prisma.$transaction([
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionProject.update({
        where: { id: project.id },
        data: { status: "LIVE", startsAt, endsAt },
      }),
    ]);
  }
}
