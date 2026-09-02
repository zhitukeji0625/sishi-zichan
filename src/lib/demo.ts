import { prisma } from "@/lib/prisma";

/** 演示竞拍过期且无已签合同时，自动恢复为 LIVE 以便继续演示出价。 */
export async function refreshDemoAuctionIfExpired() {
  const now = new Date();
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      contracts: { where: { status: "SIGNED" }, take: 1 },
    },
  });

  for (const project of ended) {
    if (project.contracts.length > 0) continue;
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: {
        status: "LIVE",
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
