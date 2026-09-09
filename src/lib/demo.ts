import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Reset expired demo auction so seed data stays testable in dev/cron runs. */
export async function refreshDemoAuctionIfExpired() {
  const user = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!user) return;

  const regs = await prisma.auctionRegistration.findMany({
    where: { endUserId: user.id },
    include: { project: true },
  });
  const now = new Date();
  for (const reg of regs) {
    const p = reg.project;
    if (p.status !== "ENDED" && p.status !== "CANCELLED") continue;
    await prisma.auctionProject.update({
      where: { id: p.id },
      data: {
        status: "LIVE",
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
