import { prisma } from "@/lib/prisma";

/**
 * 演示环境：已结束且无已签署合同的竞拍项目自动重置为 LIVE，
 * 避免种子数据过期后演示账号无法出价。
 */
export async function refreshDemoAuctionIfExpired() {
  const now = new Date();
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED", endsAt: { lt: now } },
    select: { id: true },
  });
  if (ended.length === 0) return;

  for (const { id } of ended) {
    const signed = await prisma.contract.findFirst({
      where: { auctionProjectId: id, status: "SIGNED" },
      select: { id: true },
    });
    if (signed) continue;

    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: id } }),
      prisma.contract.deleteMany({ where: { auctionProjectId: id } }),
      prisma.auctionProject.update({
        where: { id },
        data: {
          status: "LIVE",
          startsAt: new Date(now.getTime() - 60_000),
          endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
  }
}
