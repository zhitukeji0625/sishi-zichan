import { prisma } from "@/lib/prisma";

/** 演示竞拍过期后自动续期为 LIVE，便于 cron 冒烟测试与本地演示。 */
export async function refreshDemoAuctionIfExpired() {
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "asc" },
    include: { asset: { select: { name: true } } },
  });
  if (!project) return;

  const now = new Date();
  if (project.status !== "ENDED" && project.endsAt > now) return;

  const starts = new Date(now.getTime() - 60 * 1000);
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      startsAt: starts,
      endsAt: ends,
      status: "LIVE",
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
}
