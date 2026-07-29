import { PrismaClient } from "@prisma/client";

/** 保持演示竞拍可出价：延长窗口或新建 LIVE 项目（已结案则新建）。 */
export async function refreshDemoAuctionWindow(prisma: PrismaClient) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  const asset = await prisma.asset.findFirst({ where: { name: "团部东侧闲置地块" } });
  if (!demoUser || !asset) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const latest = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id },
    orderBy: { createdAt: "desc" },
    include: { result: true },
  });

  let projectId: string;

  if (!latest) {
    const created = await prisma.auctionProject.create({
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
    projectId = created.id;
  } else if (latest.result || latest.status === "ENDED") {
    const created = await prisma.auctionProject.create({
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
    projectId = created.id;
  } else {
    await prisma.auctionProject.update({
      where: { id: latest.id },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
    });
    projectId = latest.id;
  }

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
