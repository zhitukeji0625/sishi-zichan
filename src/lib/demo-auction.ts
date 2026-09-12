import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

async function ensureDemoRegistration(projectId: string) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;
  await prisma.auctionRegistration.upsert({
    where: { projectId_endUserId: { projectId, endUserId: demoUser.id } },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}

/** 确保存在至少一场进行中的演示竞拍（开发/种子数据续期用）。 */
export async function ensureDemoLiveAuction() {
  const now = new Date();
  await prisma.auctionProject.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    data: { status: "LIVE" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "ENDED" },
  });

  const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (live) {
    await ensureDemoRegistration(live.id);
    return live;
  }

  const ended = await prisma.auctionProject.findFirst({
    where: { status: "ENDED" },
    orderBy: { endsAt: "desc" },
  });
  if (ended) {
    const renewed = await prisma.auctionProject.update({
      where: { id: ended.id },
      data: {
        status: "LIVE",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await ensureDemoRegistration(renewed.id);
    return renewed;
  }

  const asset = await prisma.asset.findFirst({ where: { type: "LAND" } });
  if (!asset) return null;

  const project = await prisma.auctionProject.create({
    data: {
      code: `AP${Date.now()}`,
      assetId: asset.id,
      startPrice: 8000,
      bidStep: 200,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      depositAmount: 500,
      status: "LIVE",
    },
  });
  await ensureDemoRegistration(project.id);
  return project;
}
