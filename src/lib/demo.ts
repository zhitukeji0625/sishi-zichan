import { prisma } from "@/lib/prisma";

/** 演示竞拍过期且无已签合同后自动恢复为 LIVE，便于持续演示。 */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      contracts: { where: { status: "SIGNED" }, take: 1 },
    },
  });

  for (const project of ended) {
    if (project.contracts.length > 0) continue;

    const starts = new Date(Date.now() - 60 * 1000);
    const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
    });
  }
}
