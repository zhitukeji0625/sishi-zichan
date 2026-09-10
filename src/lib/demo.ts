import { prisma } from "@/lib/prisma";

/** Keep seed demo auction LIVE so smoke tests and demos can place bids after expiry. */
export async function refreshDemoAuctionIfExpired() {
  const now = new Date();
  const liveCount = await prisma.auctionProject.count({ where: { status: "LIVE" } });
  if (liveCount > 0) return;

  const ended = await prisma.auctionProject.findFirst({
    where: {
      status: "ENDED",
      endsAt: { lt: now },
      registrations: { some: { status: "APPROVED", depositPaid: true } },
    },
    orderBy: { endsAt: "desc" },
  });
  if (!ended) return;

  await prisma.auctionProject.update({
    where: { id: ended.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
