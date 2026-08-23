import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** 开发环境：将演示竞拍从已结束状态恢复为进行中，便于功能测试。 */
export async function refreshDemoAuction() {
  if (process.env.NODE_ENV === "production") return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
    include: { project: { include: { result: true } } },
  });
  if (!reg) return;

  const { project } = reg;
  if (project.status !== "ENDED") return;

  await prisma.$transaction(async (tx) => {
    await tx.auctionResult.deleteMany({ where: { projectId: project.id } });
    await tx.auctionBid.deleteMany({ where: { projectId: project.id } });
    const starts = new Date(Date.now() - 60 * 1000);
    const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await tx.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
    });
  });
}
