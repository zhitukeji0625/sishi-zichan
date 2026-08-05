import type { PrismaClient } from "@prisma/client";

const DEMO_USER_PHONE = "13800138000";

/** Keep the demo auction LIVE so README demo account can bid after re-seed. */
export async function refreshDemoAuction(prisma: PrismaClient) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id },
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });
  const project =
    reg?.project ?? (await prisma.auctionProject.findFirst({ orderBy: { createdAt: "desc" } }));
  if (!project) return;

  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionResult.deleteMany({ where: { projectId: project.id } });
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt, endsAt },
  });
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
  console.log(`  Demo auction refreshed: ${project.code} (LIVE until ${endsAt.toISOString()})`);
}
