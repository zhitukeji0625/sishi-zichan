import { prisma } from "@/lib/prisma";

/**
 * Reset expired demo auctions back to LIVE when no contract has been signed,
 * so cron/CI environments always have a biddable project.
 */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      contracts: { where: { status: "SIGNED" }, take: 1 },
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
          startsAt: new Date(now - 60_000),
          endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });
  }
}
