import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Keep the seeded demo auction in a live window for local / cron smoke tests. */
export async function refreshDemoAuctionWindow() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) {
    console.log("refreshDemoAuctionWindow: demo user missing, skipped.");
    return;
  }

  let project = await prisma.auctionProject.findFirst({
    where: { asset: { name: "团部东侧闲置地块" } },
    orderBy: { createdAt: "desc" },
  });
  if (!project) {
    project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  }
  if (!project) {
    console.log("refreshDemoAuctionWindow: no auction project, skipped.");
    return;
  }

  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt, endsAt },
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

  console.log(`refreshDemoAuctionWindow: project ${project.code} set LIVE until ${endsAt.toISOString()}`);
}
