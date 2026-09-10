import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Reset the seed demo auction to LIVE when it has ended, so cron/GUI tests can bid again. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const project = await prisma.auctionProject.findFirst({
    where: { registrations: { some: { endUserId: demoUser.id } } },
    orderBy: { createdAt: "asc" },
  });
  if (!project || project.status !== "ENDED") return;

  const now = Date.now();
  const startsAt = new Date(now - 60_000);
  const endsAt = new Date(now + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
    prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
    prisma.contract.deleteMany({ where: { auctionProjectId: project.id } }),
    prisma.payment.deleteMany({ where: { auctionProjectId: project.id } }),
    prisma.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt, endsAt },
    }),
    prisma.auctionRegistration.updateMany({
      where: { projectId: project.id },
      data: { status: "APPROVED", depositPaid: true },
    }),
  ]);
}
