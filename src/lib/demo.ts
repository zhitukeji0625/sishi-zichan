import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/**
 * Renew the demo auction when it has expired and no LIVE project remains.
 * Keeps demo environments usable without re-seeding.
 */
export async function refreshDemoAuctionIfExpired() {
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, depositPaid: true },
    orderBy: { createdAt: "desc" },
    select: { projectId: true },
  });
  if (!reg) return;

  const starts = new Date(Date.now() - 60_000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
