import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep the seed demo auction usable when its time window has passed. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg?.project) return;

  const project = reg.project;
  const now = Date.now();
  const endsAt = project.endsAt.getTime();
  if (project.status !== "ENDED" && endsAt > now) return;

  const startsAt = new Date(now - 60_000);
  const newEndsAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt, endsAt: newEndsAt },
  });
  await prisma.auctionRegistration.update({
    where: { id: reg.id },
    data: { status: "APPROVED", depositPaid: true },
  });
}
