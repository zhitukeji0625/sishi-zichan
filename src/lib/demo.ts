import { prisma } from "@/lib/prisma";

/** 演示竞拍过期后自动恢复为 LIVE，便于持续演示出价流程 */
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

    const duration = project.endsAt.getTime() - project.startsAt.getTime();
    const startsAt = new Date(now - 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + Math.max(duration, 7 * 24 * 60 * 60 * 1000));

    await prisma.$transaction([
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionProject.update({
        where: { id: project.id },
        data: { status: "LIVE", startsAt, endsAt },
      }),
    ]);
  }
}
