import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/**
 * If the seeded demo auction has ended, extend it so demo bidding still works.
 * Called from root layout on each request (idempotent).
 */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const project = reg.project;
  const now = new Date();
  if (project.status === "LIVE" && project.endsAt > now) return;

  const starts = new Date(now.getTime() - 60_000);
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
