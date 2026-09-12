import { prisma } from "@/lib/prisma";

/** Keep demo auction usable when seed data is stale (endsAt passed). */
export async function refreshDemoAuctionIfStale() {
  const now = new Date();
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (live && live.endsAt > now) return;

  const stale = await prisma.auctionProject.findFirst({
    where: { status: { in: ["ENDED", "LIVE"] } },
    orderBy: { createdAt: "desc" },
    include: { asset: true },
  });

  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (stale) {
    await prisma.auctionProject.update({
      where: { id: stale.id },
      data: { status: "LIVE", startsAt, endsAt },
    });
    await prisma.auctionRegistration.upsert({
      where: {
        projectId_endUserId: { projectId: stale.id, endUserId: demoUser.id },
      },
      update: { status: "APPROVED", depositPaid: true },
      create: {
        projectId: stale.id,
        endUserId: demoUser.id,
        status: "APPROVED",
        depositPaid: true,
      },
    });
    return;
  }

  const asset = await prisma.asset.findFirst({ where: { status: "IDLE" } });
  if (!asset) return;

  const project = await prisma.auctionProject.create({
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
  await prisma.auctionRegistration.create({
    data: {
      projectId: project.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
