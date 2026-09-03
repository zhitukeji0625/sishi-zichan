import { prisma } from "@/lib/prisma";

/**
 * 演示竞拍过期且无已签合同：自动恢复为 LIVE，便于 cron/冒烟测试持续可出价。
 */
export async function refreshDemoAuctionIfExpired() {
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: { result: true },
    orderBy: { updatedAt: "desc" },
  });

  for (const project of ended) {
    const signed = await prisma.contract.findFirst({
      where: { auctionProjectId: project.id, status: "SIGNED" },
    });
    if (signed) continue;

    const startsAt = new Date(Date.now() - 60_000);
    const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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
    return;
  }
}
