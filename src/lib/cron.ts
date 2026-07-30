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

/** Keep a demo auction LIVE for local/dev when seed data has expired. */
export async function ensureDemoLiveAuction() {
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  if (!project) return;

  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt, endsAt },
  });

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  await prisma.auctionRegistration.upsert({
    where: { projectId_endUserId: { projectId: project.id, endUserId: demoUser.id } },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
