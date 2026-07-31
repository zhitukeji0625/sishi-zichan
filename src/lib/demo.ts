import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** 演示竞拍过期后自动续期为 LIVE，保证本地开发与冒烟测试可用。 */
export async function refreshDemoAuctionIfExpired() {
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const projectId = reg.projectId;
  const now = Date.now();
  const startsAt = new Date(now - 60 * 1000);
  const endsAt = new Date(now + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.auctionBid.deleteMany({ where: { projectId } }),
    prisma.auctionResult.deleteMany({ where: { projectId } }),
    prisma.auctionProject.update({
      where: { id: projectId },
      data: { status: "LIVE", startsAt, endsAt },
    }),
    prisma.auctionRegistration.update({
      where: { id: reg.id },
      data: { status: "APPROVED", depositPaid: true, rejectReason: null },
    }),
  ]);
}
