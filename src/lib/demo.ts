import { prisma } from "@/lib/prisma";
import { refreshAuctionProjectStatuses } from "@/lib/cron";

const DEMO_ASSET_NAME = "团部东侧闲置地块";
const DEMO_USER_PHONE = "13800138000";

/** Restore the seeded demo auction when it has ended so dev/cron tests stay usable. */
export async function refreshDemoAuctionIfExpired() {
  await refreshAuctionProjectStatuses();

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const asset = await prisma.asset.findFirst({ where: { name: DEMO_ASSET_NAME } });
  if (!asset) return;

  const project = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id },
    orderBy: { createdAt: "desc" },
  });
  if (!project) return;

  const now = new Date();
  if (project.status === "ENDED" || project.endsAt <= now) {
    const starts = new Date(now.getTime() - 60 * 1000);
    const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
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
  }
}
