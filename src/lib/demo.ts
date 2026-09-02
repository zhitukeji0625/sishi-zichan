import { prisma } from "@/lib/prisma";

/** 演示环境：已结束且未签署合同的竞拍自动恢复为进行中，便于重复演示出价流程。 */
export async function refreshDemoAuctionIfExpired() {
  const now = new Date();
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      contracts: { where: { status: "SIGNED" } },
    },
  });

  for (const project of ended) {
    if (project.contracts.length > 0) continue;

    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
      prisma.contract.deleteMany({
        where: { auctionProjectId: project.id, status: "DRAFT" },
      }),
      prisma.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(now.getTime() - 60_000),
          endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
  }
}
