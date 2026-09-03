import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/**
 * 演示竞拍过期且无已签合同时自动恢复为 LIVE，便于 cron 冒烟测试与演示环境。
 */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const registration = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!registration) return;

  const project = registration.project;
  if (project.status !== "ENDED") return;

  const signedContract = await prisma.contract.findFirst({
    where: { auctionProjectId: project.id, status: "SIGNED" },
  });
  if (signedContract) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
