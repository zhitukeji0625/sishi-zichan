import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep a demo LIVE auction available for development and smoke tests. */
export async function ensureDemoLiveAuction() {
  const live = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (live > 0) return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  const asset = await prisma.asset.findFirst({
    where: { type: "LAND", name: { contains: "团部东侧" } },
  });
  if (!asset) return;

  const startsAt = new Date(Date.now() - 60_000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const ended = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id, status: { in: ["ENDED", "SCHEDULED"] } },
    orderBy: { updatedAt: "desc" },
  });

  let projectId: string;
  if (ended) {
    const updated = await prisma.auctionProject.update({
      where: { id: ended.id },
      data: { status: "LIVE", startsAt, endsAt },
    });
    projectId = updated.id;
  } else {
    const created = await prisma.auctionProject.create({
      data: {
        code: `AP${Date.now()}`,
        assetId: asset.id,
        startPrice: 8000,
        bidStep: 200,
        startsAt,
        endsAt,
        depositAmount: 500,
        status: "LIVE",
      },
    });
    projectId = created.id;
  }

  if (demoUser) {
    await prisma.auctionRegistration.upsert({
      where: {
        projectId_endUserId: { projectId, endUserId: demoUser.id },
      },
      update: { status: "APPROVED", depositPaid: true },
      create: {
        projectId,
        endUserId: demoUser.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
  }
}
