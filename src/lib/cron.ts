import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep seed demo auction playable when stale (dev/demo environments). */
async function refreshSeedDemoAuctionIfStale() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;
  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
    include: { project: true },
  });
  const project = reg?.project;
  if (!project || project.status !== "ENDED") return;
  const now = new Date();
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
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
  await refreshSeedDemoAuctionIfStale();
}
