import type { PrismaClient } from "@prisma/client";

const DEMO_ASSET_NAME = "团部东侧闲置地块";
const DEMO_USER_PHONE = "13800138000";

/** 将演示竞拍刷新为 LIVE，便于长期运行的演示环境持续可测。 */
export async function refreshDemoAuction(prisma: PrismaClient) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  const asset = await prisma.asset.findFirst({ where: { name: DEMO_ASSET_NAME } });
  if (!demoUser || !asset) return;

  const now = Date.now();
  const starts = new Date(now - 60 * 1000);
  const ends = new Date(now + 7 * 24 * 60 * 60 * 1000);

  let project = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id },
    orderBy: { createdAt: "desc" },
  });

  if (!project) return;

  const stillLive = project.status === "LIVE" && project.endsAt > new Date();
  if (!stillLive) {
    await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
    await prisma.auctionResult.deleteMany({ where: { projectId: project.id } });
    project = await prisma.auctionProject.update({
      where: { id: project.id },
      data: { startsAt: starts, endsAt: ends, status: "LIVE" },
    });
  } else {
    await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
  }

  await prisma.auctionRegistration.upsert({
    where: { projectId_endUserId: { projectId: project.id, endUserId: demoUser.id } },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
