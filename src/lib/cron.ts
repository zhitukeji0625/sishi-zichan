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
 * Reset demo auction to LIVE when it ended without a signed lease contract,
 * so seed/demo flows (bidding, cron smoke tests) stay usable.
 */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const ended = await prisma.auctionProject.findMany({
    where: {
      status: "ENDED",
      registrations: { some: { endUserId: demoUser.id } },
    },
    include: {
      result: true,
      contracts: { where: { type: "AUCTION_LEASE", status: "SIGNED" } },
    },
  });

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  for (const project of ended) {
    if (project.contracts.length > 0) continue;

    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionProject.update({
        where: { id: project.id },
        data: { status: "LIVE", startsAt: starts, endsAt: ends },
      }),
    ]);
  }
}
