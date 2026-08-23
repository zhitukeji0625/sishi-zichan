import { prisma } from "@/lib/prisma";

const DEMO_ASSET_NAME = "团部东侧闲置地块";

/** Reset stale demo auction (ENDED + published result) so cron/dev testing can bid again. */
export async function refreshDemoAuction() {
  const asset = await prisma.asset.findFirst({ where: { name: DEMO_ASSET_NAME } });
  if (!asset) return;

  const project = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id },
    include: { result: true },
    orderBy: { createdAt: "asc" },
  });
  if (!project || project.status !== "ENDED") return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });

  if (project.result) {
    await prisma.auctionResult.delete({ where: { projectId: project.id } });
  }
}
