import { prisma } from "@/lib/prisma";

/**
 * Reset demo auctions that ended without a signed contract so cron testing
 * can always exercise LIVE bidding flows.
 */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      contracts: { where: { status: "SIGNED" }, select: { id: true } },
    },
  });

  for (const project of ended) {
    if (project.contracts.length > 0) continue;

    await prisma.$transaction(async (tx) => {
      await tx.auctionBid.deleteMany({ where: { projectId: project.id } });
      await tx.auctionResult.deleteMany({ where: { projectId: project.id } });
      await tx.contract.deleteMany({ where: { auctionProjectId: project.id } });
      await tx.payment.deleteMany({ where: { auctionProjectId: project.id } });

      const now = Date.now();
      await tx.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(now - 60 * 1000),
          endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });
  }
}
