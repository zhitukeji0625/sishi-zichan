import { PrismaClient } from "@prisma/client";

/** Reset the first demo auction to LIVE (+7 days) and clear stale bids/result. */
export async function refreshDemoAuction(client: PrismaClient) {
  const project = await client.auctionProject.findFirst({ orderBy: { createdAt: "asc" } });
  if (!project) return;

  const now = Date.now();
  await client.auctionBid.deleteMany({ where: { projectId: project.id } });
  await client.auctionResult.deleteMany({ where: { projectId: project.id } });
  await client.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now - 60_000),
      endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const demoUser = await client.endUser.findUnique({ where: { phone: "13800138000" } });
  if (demoUser) {
    await client.auctionRegistration.upsert({
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
  console.log(`Demo auction ${project.code} refreshed to LIVE.`);
}
