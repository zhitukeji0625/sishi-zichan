import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Extend the seeded demo auction when it has ended so cron smoke tests can bid. */
export async function refreshDemoAuctionIfExpired() {
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "asc" },
    include: { asset: true },
  });
  if (!project) return;

  const now = new Date();
  if (project.status === "LIVE" && project.endsAt > now) return;

  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt,
      endsAt,
    },
  });

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  await prisma.auctionRegistration.upsert({
    where: {
      projectId_endUserId: { projectId: project.id, endUserId: demoUser.id },
    },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
