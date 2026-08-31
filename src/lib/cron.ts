import { prisma } from "@/lib/prisma";

/** Advance auction project statuses by time (called from server layouts). */
export async function refreshAuctionProjectStatuses() {
  const now = new Date();
  await prisma.auctionProject.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    data: { status: "LIVE" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "ENDED" },
  });
}

const DEMO_USER_PHONE = "13800138000";

/**
 * 开发/演示环境：将演示用户可参与的、已结束且未签合同的竞拍重置为进行中，
 * 便于定时冒烟测试与手工演示。
 */
export async function refreshDemoAuctionIfExpired() {
  if (process.env.NODE_ENV === "production") return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    include: {
      registrations: {
        where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
      },
      contracts: { where: { status: "SIGNED" } },
    },
  });

  const now = new Date();
  for (const project of ended) {
    if (project.registrations.length === 0 || project.contracts.length > 0) continue;
    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
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
