import type { PrismaClient } from "@prisma/client";

/** 将最早创建的演示竞拍刷新为进行中，便于本地/定时任务后仍可演示出价。 */
export async function refreshDemoAuction(prisma: PrismaClient) {
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!project) return;

  const now = Date.now();
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now - 60_000),
      endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (demoUser) {
    await prisma.auctionRegistration.upsert({
      where: {
        projectId_endUserId: { projectId: project.id, endUserId: demoUser.id },
      },
      update: { status: "APPROVED", depositPaid: true },
      create: {
        projectId: project.id,
        endUserId: demoUser.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  }
  console.log(`Demo auction ${project.code} refreshed to LIVE.`);
}
