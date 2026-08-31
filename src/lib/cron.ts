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

/** Reset expired demo auctions (no signed contract) so cron smoke tests can bid. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const ended = await prisma.auctionProject.findMany({
    where: {
      status: "ENDED",
      registrations: { some: { endUserId: demoUser.id, status: "APPROVED" } },
      contracts: { none: { status: "SIGNED" } },
    },
    include: { result: true },
  });

  for (const project of ended) {
    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
      ...(project.result
        ? [prisma.auctionResult.delete({ where: { projectId: project.id } })]
        : []),
      prisma.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
  }
}
