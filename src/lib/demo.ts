import { prisma } from "@/lib/prisma";

/** Keep the demo auction project LIVE for smoke tests and demos. */
export async function refreshDemoAuctionIfExpired() {
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

  const now = new Date();
  const needsRefresh =
    project.status === "ENDED" ||
    project.status === "CANCELLED" ||
    project.endsAt <= now;

  if (!needsRefresh) return;

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 86400_000),
    },
  });
}
