import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Keep demo auction usable when seed data already exists (cron / long-lived dev DB). */
export async function refreshDemoAuctionWindow() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  let project = await prisma.auctionProject.findFirst({
    where: { registrations: { some: { endUserId: demoUser.id } } },
    orderBy: { createdAt: "asc" },
  });

  if (!project) {
    const asset = await prisma.asset.findFirst({
      where: { name: "团部东侧闲置地块" },
    });
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
    project = await prisma.auctionProject.update({
      where: { id: project.id },
      data: { startsAt: starts, endsAt: ends, status: "LIVE" },
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
