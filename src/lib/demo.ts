import { prisma } from "@/lib/prisma";

const DEMO_PHONE = "13800138000";

/** Keep demo user's registered auction LIVE when it has expired (dev/demo environments). */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_PHONE } });
  if (!demoUser) return;

  const activeReg = await prisma.auctionRegistration.findFirst({
    where: {
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
      project: { status: "LIVE" },
    },
  });
  if (activeReg) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
