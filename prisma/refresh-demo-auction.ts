import type { PrismaClient } from "@prisma/client";

const DEMO_USER_PHONE = "13800138000";
const DEMO_ASSET_NAME = "团部东侧闲置地块";

/** 保持演示竞拍在 LIVE 窗口内，供种子跳过或定时任务后仍可出价。 */
export async function refreshDemoAuctionWindow(prisma: PrismaClient) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let project = await prisma.auctionProject.findFirst({
    where: { registrations: { some: { endUserId: demoUser.id } } },
    orderBy: { createdAt: "desc" },
  });

  if (!project) {
    const asset = await prisma.asset.findFirst({ where: { name: DEMO_ASSET_NAME } });
    if (!asset) return;
    project = await prisma.auctionProject.create({
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
  } else {
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
    });
  }

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
