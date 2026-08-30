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

/** Reset demo auction to LIVE when expired and no signed contract exists. */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: { contracts: { where: { status: "SIGNED" } } },
  });
  for (const p of ended) {
    if (p.contracts.length > 0) continue;
    const now = new Date();
    await prisma.auctionProject.update({
      where: { id: p.id },
      data: {
        status: "LIVE",
        startsAt: now,
        endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
