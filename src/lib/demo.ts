import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** 演示环境：将已结束的演示竞拍重置为进行中，并清除过期公示结果 */
export async function refreshDemoAuction() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const endedRegs = await prisma.auctionRegistration.findMany({
    where: { endUserId: demoUser.id, project: { status: "ENDED" } },
    include: { project: { include: { result: true } } },
  });

  for (const reg of endedRegs) {
    const { projectId, project } = reg;
    if (project.result) {
      await prisma.auctionResult.delete({ where: { projectId } });
    }
    await prisma.auctionProject.update({
      where: { id: projectId },
      data: {
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
