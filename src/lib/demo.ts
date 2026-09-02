import { prisma } from "@/lib/prisma";

/** 演示环境：已结束且无已签署合同的竞拍自动恢复为进行中，便于持续演示出价等功能。 */
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
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: {
        status: "LIVE",
        startsAt: new Date(now - 60_000),
        endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
