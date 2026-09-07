import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Extend the demo user's seeded auction when it has ended, so H5 bidding stays testable. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const registration = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, status: "APPROVED" },
    include: { project: true },
    orderBy: { createdAt: "asc" },
  });
  if (!registration) return;

  const project = registration.project;
  const now = new Date();
  if (project.status !== "ENDED" && project.endsAt > now) return;

  await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
