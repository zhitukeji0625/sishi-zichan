import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Extend the seed demo auction when it has ended so H5 bidding demo keeps working. */
export async function refreshDemoAuctionIfExpired() {
  const user = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!user) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: user.id, depositPaid: true, status: "APPROVED" },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const project = reg.project;
  const now = new Date();
  if (project.status === "LIVE" && project.endsAt > now) return;

  const starts = new Date(now.getTime() - 60 * 1000);
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
