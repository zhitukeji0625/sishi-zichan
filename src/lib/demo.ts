import { prisma } from "@/lib/prisma";

/** Reset demo auctions that ended without a signed contract so bidding stays testable. */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    select: { id: true },
  });
  if (ended.length === 0) return;

  for (const { id } of ended) {
    const signed = await prisma.contract.findFirst({
      where: { auctionProjectId: id, status: "SIGNED" },
      select: { id: true },
    });
    if (signed) continue;

    const starts = new Date(Date.now() - 60 * 1000);
    const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: id } }),
      prisma.auctionProject.update({
        where: { id },
        data: { status: "LIVE", startsAt: starts, endsAt: ends },
      }),
    ]);
  }
}
