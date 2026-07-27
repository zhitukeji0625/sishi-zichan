import { PrismaClient } from "@prisma/client";

/** Keep at least one LIVE demo auction for local / cron smoke tests. */
export async function refreshDemoAuction(prisma: PrismaClient) {
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "asc" },
    include: { asset: true },
  });
  if (!project) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      startsAt: starts,
      endsAt: ends,
      status: "LIVE",
    },
  });

  const demoUser = await prisma.endUser.findUnique({
    where: { phone: "13800138000" },
  });
  if (demoUser) {
    await prisma.auctionRegistration.upsert({
      where: {
        projectId_endUserId: {
          projectId: project.id,
          endUserId: demoUser.id,
        },
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
}
