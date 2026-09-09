import { prisma } from "@/lib/prisma";

/**
 * If the sole demo auction project has ended, renew it so smoke tests / demos keep working.
 * Called from root layout on each request (idempotent).
 */
export async function refreshDemoAuctionIfExpired() {
  const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (live) return;

  const ended = await prisma.auctionProject.findFirst({
    where: { status: "ENDED" },
    orderBy: { endsAt: "desc" },
  });
  if (!ended) return;

  const starts = new Date(Date.now() - 60_000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: ended.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
