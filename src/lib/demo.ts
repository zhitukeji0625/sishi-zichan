import { prisma } from "@/lib/prisma";

/** 开发环境下将已过期的演示竞拍恢复为 LIVE，便于持续演示出价流程 */
export async function refreshDemoAuctionIfExpired() {
  if (process.env.NODE_ENV === "production") return;
  const now = new Date();
  const expired = await prisma.auctionProject.findFirst({
    where: { status: "ENDED" },
    orderBy: { createdAt: "asc" },
  });
  if (!expired) return;
  await prisma.auctionResult.deleteMany({ where: { projectId: expired.id } });
  await prisma.auctionBid.deleteMany({ where: { projectId: expired.id } });
  await prisma.auctionProject.update({
    where: { id: expired.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
