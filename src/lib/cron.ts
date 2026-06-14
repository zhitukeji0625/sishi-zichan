import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep the seeded demo auction playable after its window expires. */
export async function ensureDemoAuctionLive() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg?.project) return;

  const now = new Date();
  if (reg.project.status === "LIVE" && reg.project.endsAt > now) return;

  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: {
      status: "LIVE",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

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
  await ensureDemoAuctionLive();
}
