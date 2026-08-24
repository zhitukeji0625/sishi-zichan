import { prisma } from "@/lib/prisma";

/**
 * Reset demo auction projects that have ended without signed contracts,
 * so seeded demo data stays usable across cron runs.
 */
export async function refreshDemoAuctionIfExpired() {
  if (process.env.NODE_ENV === "production") return;

  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      contracts: { where: { status: "SIGNED" }, take: 1 },
    },
  });

  for (const project of ended) {
    if (project.contracts.length > 0) continue;

    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
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
