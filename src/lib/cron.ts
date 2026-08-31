import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

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

/** Reset demo user's ended auction (no signed contract) so cron/GUI tests can bid again. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const regs = await prisma.auctionRegistration.findMany({
    where: { endUserId: demoUser.id, status: "APPROVED" },
    select: { projectId: true },
  });
  if (regs.length === 0) return;

  for (const { projectId } of regs) {
    const signed = await prisma.contract.findFirst({
      where: { auctionProjectId: projectId, status: "SIGNED" },
    });
    if (signed) continue;

    const project = await prisma.auctionProject.findUnique({ where: { id: projectId } });
    if (!project || project.status !== "ENDED") continue;

    const now = Date.now();
    await prisma.$transaction([
      prisma.auctionBid.deleteMany({ where: { projectId } }),
      prisma.auctionResult.deleteMany({ where: { projectId } }),
      prisma.auctionProject.update({
        where: { id: projectId },
        data: {
          status: "LIVE",
          startsAt: new Date(now - 60 * 1000),
          endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
  }
}
