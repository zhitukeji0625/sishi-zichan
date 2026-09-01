import { prisma } from "@/lib/prisma";

/** Restore expired demo auctions without signed contracts back to LIVE for testing. */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    select: { id: true },
  });
  if (ended.length === 0) return;

  const now = new Date();
  for (const p of ended) {
    const signed = await prisma.contract.findFirst({
      where: { auctionProjectId: p.id, status: "SIGNED" },
    });
    if (signed) continue;

    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: p.id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: p.id } }),
      prisma.auctionProject.update({
        where: { id: p.id },
        data: {
          status: "LIVE",
          startsAt: new Date(now.getTime() - 60_000),
          endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
  }
}
