import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Keep the seeded demo auction in a LIVE window for local/demo environments. */
export async function refreshDemoAuctionWindow() {
  const asset = await prisma.asset.findFirst({
    where: { name: "团部东侧闲置地块" },
    select: { id: true },
  });
  if (!asset) return;

  const project = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id },
    orderBy: { createdAt: "desc" },
  });
  if (!project) return;

  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      startsAt,
      endsAt,
      status: "LIVE",
    },
  });

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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshDemoAuctionWindow()
    .then(() => {
      console.log("Demo auction window refreshed.");
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
