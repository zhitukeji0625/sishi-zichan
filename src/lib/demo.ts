import { prisma } from "@/lib/prisma";

const DEMO_ASSET_NAME = "团部东侧闲置地块";
const DEMO_USER_PHONE = "13800138000";

/**
 * Reset the seeded demo auction when it has ended so cron/smoke tests always
 * have a LIVE project with an approved, deposit-paid demo user.
 */
export async function refreshDemoAuctionIfExpired() {
  const asset = await prisma.asset.findFirst({ where: { name: DEMO_ASSET_NAME } });
  if (!asset) return;

  const project = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id },
    orderBy: { createdAt: "desc" },
  });
  if (!project || project.status !== "ENDED") return;

  const now = Date.now();
  await prisma.$transaction([
    prisma.auctionBid.deleteMany({ where: { projectId: project.id } }),
    prisma.auctionResult.deleteMany({ where: { projectId: project.id } }),
    prisma.payment.deleteMany({ where: { auctionProjectId: project.id } }),
    prisma.contract.deleteMany({ where: { auctionProjectId: project.id } }),
    prisma.auctionProject.update({
      where: { id: project.id },
      data: {
        status: "LIVE",
        startsAt: new Date(now - 60_000),
        endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (demoUser) {
    await prisma.auctionRegistration.upsert({
      where: { projectId_endUserId: { projectId: project.id, endUserId: demoUser.id } },
      update: { status: "APPROVED", depositPaid: true, rejectReason: null },
      create: {
        projectId: project.id,
        endUserId: demoUser.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  }
}
