import { prisma } from "@/lib/prisma";

/** Restore ended demo auctions without signed contracts so H5 bidding stays testable. */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      contracts: { where: { status: "SIGNED" }, take: 1 },
    },
  });

  const now = Date.now();
  for (const project of ended) {
    if (project.contracts.length > 0) continue;
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
