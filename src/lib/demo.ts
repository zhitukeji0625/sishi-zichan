import { prisma } from "@/lib/prisma";

/** 演示环境：若无进行中竞拍，将最近一场已结束的竞拍续期为 LIVE。 */
export async function refreshDemoAuctionIfExpired() {
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const ended = await prisma.auctionProject.findFirst({
    where: { status: "ENDED" },
    orderBy: { endsAt: "desc" },
  });
  if (!ended) return;

  const now = new Date();
  await prisma.auctionProject.update({
    where: { id: ended.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
