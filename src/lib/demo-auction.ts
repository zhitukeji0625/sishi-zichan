import { prisma } from "@/lib/prisma";

/** 确保演示环境始终有一场进行中的竞拍（种子或定时任务可调用）。 */
export async function refreshDemoAuction() {
  const now = new Date();
  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE", endsAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (live) return live;

  const asset =
    (await prisma.asset.findFirst({ where: { type: "LAND" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.asset.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!asset) return null;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const ended = await prisma.auctionProject.findFirst({
    where: { status: { in: ["ENDED", "LIVE"] } },
    orderBy: { createdAt: "desc" },
  });

  let project;
  if (ended) {
    project = await prisma.auctionProject.update({
      where: { id: ended.id },
      data: {
        status: "LIVE",
        startsAt: starts,
        endsAt: ends,
        startPrice: ended.startPrice,
        bidStep: ended.bidStep,
      },
    });
  } else {
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
  }

  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
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

  return project;
}
