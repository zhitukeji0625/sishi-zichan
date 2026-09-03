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

/** Keep the seed demo auction usable when cron tests run after it has ended. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg?.project) return;

  const now = new Date();
  const { project } = reg;
  if (project.status !== "ENDED" && project.endsAt > now) return;

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
