import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep seed demo auction bid-able in dev when cron marks overdue projects ENDED. */
export async function ensureDemoLiveAuction() {
  if (process.env.NODE_ENV === "production") return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: {
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const hasResult = await prisma.auctionResult.findUnique({
    where: { projectId: reg.projectId },
  });
  if (hasResult) return;

  const now = Date.now();
  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: {
      status: "LIVE",
      startsAt: new Date(now - 60_000),
      endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
