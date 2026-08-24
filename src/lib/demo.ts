import { prisma } from "@/lib/prisma";

/** 演示竞拍过期后自动续期为 LIVE，便于 cron 冒烟测试与本地演示。 */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const project = await prisma.auctionProject.findFirst({
    where: {
      registrations: { some: { endUserId: demoUser.id, depositPaid: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!project) return;

  const now = new Date();
  if (project.status === "LIVE" && project.endsAt > now) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionResult.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
