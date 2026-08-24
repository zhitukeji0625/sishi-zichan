import { prisma } from "@/lib/prisma";

/**
 * Keep demo auction projects usable: remove unpublished results and
 * reset ENDED projects (no published result) back to LIVE with fresh dates.
 */
export async function refreshDemoAuctionIfExpired() {
  const staleResults = await prisma.auctionResult.findMany({
    where: { status: { not: "PUBLISHED" } },
    select: { id: true, projectId: true },
  });
  if (staleResults.length > 0) {
    await prisma.auctionResult.deleteMany({
      where: { id: { in: staleResults.map((r) => r.id) } },
    });
  }

  const ended = await prisma.auctionProject.findMany({
    where: {
      status: "ENDED",
      OR: [{ result: null }, { result: { status: { not: "PUBLISHED" } } }],
    },
    select: { id: true },
  });

  if (ended.length === 0) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.updateMany({
    where: { id: { in: ended.map((p) => p.id) } },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
