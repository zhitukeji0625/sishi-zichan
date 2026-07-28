import { prisma } from "@/lib/prisma";

const DEMO_AUCTION_ASSET_NAME = "团部东侧闲置地块";
const DEMO_USER_PHONE = "13800138000";

/** 演示竞拍到期结束后，在无进行中项目时恢复可出价状态（开发/演示环境） */
export async function ensureDemoLiveAuction() {
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  const asset = await prisma.asset.findFirst({ where: { name: DEMO_AUCTION_ASSET_NAME } });
  if (!demoUser || !asset) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const reusable = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id, result: null },
    orderBy: { createdAt: "desc" },
  });

  const project = reusable
    ? await prisma.auctionProject.update({
        where: { id: reusable.id },
        data: { status: "LIVE", startsAt: starts, endsAt: ends },
      })
    : await prisma.auctionProject.create({
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
