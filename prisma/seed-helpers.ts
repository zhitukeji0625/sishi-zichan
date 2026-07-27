import type { PrismaClient } from "@prisma/client";

/** 将最早创建的演示竞拍刷新为进行中，便于本地与自动化测试。 */
export async function refreshDemoAuction(prisma: PrismaClient) {
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!project) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: starts,
      endsAt: ends,
    },
  });

  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

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
