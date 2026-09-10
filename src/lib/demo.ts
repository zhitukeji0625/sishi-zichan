import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";
const DEMO_ASSET_NAME = "团部东侧闲置地块";

/**
 * Ensure a LIVE demo auction exists for smoke tests and demos.
 * Called from root layout on each request (idempotent).
 */
export async function refreshDemoAuctionIfExpired() {
  const live = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (live > 0) return;

  const asset = await prisma.asset.findFirst({ where: { name: DEMO_ASSET_NAME } });
  if (!asset) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const project = await prisma.auctionProject.create({
    data: {
      code: `AP${Date.now()}`,
      assetId: asset.id,
      startPrice: 8000,
      bidStep: 200,
      startsAt: starts,
      endsAt: ends,
      depositAmount: 500,
      status: "LIVE",
    },
  });

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (demoUser) {
    await prisma.auctionRegistration.upsert({
      where: {
        projectId_endUserId: { projectId: project.id, endUserId: demoUser.id },
      },
      update: { status: "APPROVED", depositPaid: true },
      create: {
        projectId: project.id,
        endUserId: demoUser.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  }
}
