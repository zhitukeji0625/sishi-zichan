import { prisma } from "@/lib/prisma";

const DEMO_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reset the seed demo auction when it has ended so cron/smoke tests can bid again.
 * Clears bids and published results, then sets status back to LIVE.
 */
export async function refreshDemoAuctionIfExpired() {
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "asc" },
    include: { result: true },
  });
  if (!project) return;

  const now = new Date();
  const expired = project.status === "ENDED" || project.endsAt <= now;
  if (!expired) return;

  const startsAt = new Date(now.getTime() - 60 * 1000);
  const endsAt = new Date(now.getTime() + DEMO_DURATION_MS);

  await prisma.$transaction(async (tx) => {
    await tx.auctionBid.deleteMany({ where: { projectId: project.id } });
    if (project.result) {
      await tx.auctionResult.delete({ where: { projectId: project.id } });
    }
    await tx.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt, endsAt },
    });
  });
}
