import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** 演示竞拍过期后自动恢复，保证 H5 演示流程可用 */
export async function refreshDemoAuctionIfExpired() {
  const live = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (live > 0) return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id },
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });
  if (!reg) return;

  const now = Date.now();
  const startsAt = new Date(now - 60_000);
  const endsAt = new Date(now + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionResult.deleteMany({ where: { projectId: reg.projectId } });
  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: { status: "LIVE", startsAt, endsAt },
  });
  await prisma.auctionRegistration.update({
    where: { id: reg.id },
    data: { status: "APPROVED", depositPaid: true },
  });
}
