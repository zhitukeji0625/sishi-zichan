import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Extend the seeded demo auction when it has ended so H5 bidding stays testable. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  const project = reg?.project;
  if (!project || project.status !== "ENDED") return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
