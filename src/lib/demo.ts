import { prisma } from "@/lib/prisma";

const DEMO_ASSET_NAME = "团部东侧闲置地块";
const DEMO_USER_PHONE = "13800138000";

/** Restore the seed demo auction when it has ended (keeps cron demos usable). */
export async function refreshDemoAuctionIfExpired() {
  const demoAsset = await prisma.asset.findFirst({
    where: { name: DEMO_ASSET_NAME },
    select: { id: true },
  });
  if (!demoAsset) return;

  const project = await prisma.auctionProject.findFirst({
    where: { assetId: demoAsset.id },
    orderBy: { createdAt: "desc" },
  });
  if (!project) return;

  const now = new Date();
  if (project.status === "LIVE" && project.endsAt > now) return;

  const starts = new Date(now.getTime() - 60 * 1000);
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
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
