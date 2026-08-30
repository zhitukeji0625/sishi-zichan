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

/** Reset expired demo auctions without signed contracts so smoke tests can bid again. */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: {
      status: "ENDED",
      contracts: { none: { status: "SIGNED" } },
    },
    select: { id: true },
  });
  if (ended.length === 0) return;

  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const startsAt = new Date(Date.now() - 60 * 1000);
  for (const { id } of ended) {
    await prisma.auctionResult.deleteMany({ where: { projectId: id } });
    await prisma.auctionProject.update({
      where: { id },
      data: { status: "LIVE", startsAt, endsAt },
    });
  }
}
