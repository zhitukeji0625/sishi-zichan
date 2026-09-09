import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Reset the seed demo auction to LIVE when it has expired, so cron/dev testing stays usable. */
export async function refreshDemoAuctionIfExpired() {
  const user = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!user) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: user.id, status: "APPROVED", depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg?.project || reg.project.status !== "ENDED") return;

  const projectId = reg.project.id;
  const now = Date.now();
  await prisma.$transaction([
    prisma.auctionBid.deleteMany({ where: { projectId } }),
    prisma.auctionResult.deleteMany({ where: { projectId } }),
    prisma.payment.deleteMany({
      where: { auctionProjectId: projectId, purpose: { in: ["AUCTION_RENT"] } },
    }),
    prisma.contract.deleteMany({ where: { auctionProjectId: projectId } }),
    prisma.auctionProject.update({
      where: { id: projectId },
      data: {
        status: "LIVE",
        startsAt: new Date(now - 60_000),
        endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);
}
