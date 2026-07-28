import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/**
 * Keeps at least one LIVE demo auction for local/dev smoke tests after
 * `refreshAuctionProjectStatuses` ends expired projects.
 */
export async function ensureDemoLiveAuction() {
  const live = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (live > 0) return;

  const now = Date.now();
  const startsAt = new Date(now - 60_000);
  const endsAt = new Date(now + 7 * 24 * 60 * 60 * 1000);

  let project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (project) {
    project = await prisma.auctionProject.update({
      where: { id: project.id },
      data: {
        status: "LIVE",
        startsAt,
        endsAt,
      },
    });
  } else {
    const asset = await prisma.asset.findFirst({ orderBy: { createdAt: "asc" } });
    if (!asset) return;
    project = await prisma.auctionProject.create({
      data: {
        code: `AP${now}`,
        assetId: asset.id,
        startPrice: 8000,
        bidStep: 200,
        startsAt,
        endsAt,
        depositAmount: 500,
        status: "LIVE",
      },
    });
  }

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

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
