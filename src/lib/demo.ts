import { prisma } from "@/lib/prisma";

/**
 * Restore demo auctions that ended without a signed contract so bidding stays testable.
 * Only targets projects with an approved, deposit-paid registration from the demo user.
 */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({
    where: { phone: "13800138000" },
    select: { id: true },
  });
  if (!demoUser) return;

  const ended = await prisma.auctionProject.findMany({
    where: {
      status: "ENDED",
      registrations: {
        some: {
          endUserId: demoUser.id,
          status: "APPROVED",
          depositPaid: true,
        },
      },
      contracts: { none: { status: "SIGNED" } },
    },
    select: { id: true },
  });

  if (ended.length === 0) return;

  const now = new Date();
  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (const project of ended) {
    await prisma.$transaction([
      prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
      prisma.auctionProject.update({
        where: { id: project.id },
        data: { status: "LIVE", startsAt, endsAt },
      }),
    ]);
  }
}
