import { prisma } from "@/lib/prisma";

/**
 * Reset stale demo auction projects so the seeded demo stays testable.
 * Clears auctionResult for ENDED projects and re-opens them as LIVE.
 */
export async function refreshDemoAuction() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const stale = await prisma.auctionProject.findMany({
    where: {
      status: "ENDED",
      code: { startsWith: "AP" },
    },
    include: { result: true },
  });

  for (const project of stale) {
    if (project.result) {
      await prisma.auctionResult.delete({ where: { projectId: project.id } });
    }
    await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
    const starts = new Date(Date.now() - 60_000);
    const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
    });
    await prisma.auctionRegistration.upsert({
      where: {
        projectId_endUserId: { projectId: project.id, endUserId: demoUser.id },
      },
      update: { status: "APPROVED", depositPaid: true },
      create: {
        projectId: project.id,
        endUserId: demoUser.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  }
}
