import { prisma } from "@/lib/prisma";

/** 演示竞拍过期且无已签合同时，自动延长并恢复为进行中（便于 cron/演示环境持续可用）。 */
export async function refreshDemoAuctionIfExpired() {
  const ended = await prisma.auctionProject.findMany({
    where: { status: "ENDED" },
    select: { id: true },
  });
  if (ended.length === 0) return;

  const signed = await prisma.contract.findMany({
    where: {
      auctionProjectId: { in: ended.map((p) => p.id) },
      status: "SIGNED",
    },
    select: { auctionProjectId: true },
  });
  const signedIds = new Set(
    signed.map((c) => c.auctionProjectId).filter((id): id is string => id != null),
  );

  const toRefresh = ended.filter((p) => !signedIds.has(p.id));
  if (toRefresh.length === 0) return;

  const now = Date.now();
  await prisma.auctionProject.updateMany({
    where: { id: { in: toRefresh.map((p) => p.id) } },
    data: {
      status: "LIVE",
      endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      startsAt: new Date(now - 60 * 1000),
    },
  });
}
