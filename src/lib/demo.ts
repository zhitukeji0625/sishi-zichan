import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep the seed demo auction LIVE for manual testing when it has expired. */
export async function refreshDemoAuctionIfExpired() {
  const user = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!user) return;

  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    select: { id: true },
  });
  if (live) return;

  const ended = await prisma.auctionProject.findFirst({
    where: { status: "ENDED" },
    orderBy: { endsAt: "desc" },
    select: { id: true },
  });
  if (!ended) return;

  const startsAt = new Date(Date.now() - 60_000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: ended.id },
    data: { status: "LIVE", startsAt, endsAt },
  });
  await prisma.auctionRegistration.upsert({
    where: { projectId_endUserId: { projectId: ended.id, endUserId: user.id } },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: ended.id,
      endUserId: user.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
