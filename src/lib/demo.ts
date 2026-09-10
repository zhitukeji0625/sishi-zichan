import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep the seeded demo auction LIVE so cron smoke tests can bid. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({
    where: { phone: DEMO_USER_PHONE },
    select: { id: true },
  });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, depositPaid: true, status: "APPROVED" },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const now = new Date();
  const needsRefresh =
    reg.project.status !== "LIVE" || reg.project.endsAt <= now;
  if (!needsRefresh) return;

  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
