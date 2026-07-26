import { PrismaClient } from "@prisma/client";

const DEMO_USER_PHONE = "13800138000";

/** 清演示竞拍出价/结果，并将关联项目恢复为 LIVE，便于重复冒烟与演示。 */
export async function refreshDemoAuction(prisma: PrismaClient) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) {
    console.log("refreshDemoAuction: demo user missing, skip.");
    return null;
  }

  let project = await prisma.auctionProject.findFirst({
    where: {
      registrations: { some: { endUserId: demoUser.id } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!project) {
    project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } });
  }
  if (!project) {
    console.log("refreshDemoAuction: no auction project, skip.");
    return null;
  }

  await prisma.auctionBid.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionResult.deleteMany({ where: { projectId: project.id } });

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  project = await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: starts,
      endsAt: ends,
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

  console.log(`refreshDemoAuction: project ${project.code} is LIVE until ${ends.toISOString()}`);
  return project;
}
