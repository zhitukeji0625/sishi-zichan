import { prisma } from "@/lib/prisma";

/** Advance auction project statuses by time (called from server layouts). */
export async function refreshAuctionProjectStatuses() {
  const now = new Date();
  const finalized = await prisma.auctionResult.findMany({
    where: { status: { in: ["PUBLISHED", "PENDING_REVIEW"] } },
    select: { projectId: true },
  });
  if (finalized.length > 0) {
    await prisma.auctionProject.updateMany({
      where: {
        id: { in: finalized.map((r) => r.projectId) },
        status: { in: ["SCHEDULED", "LIVE"] },
      },
      data: { status: "ENDED" },
    });
  }
  await prisma.auctionProject.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    data: { status: "LIVE" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "ENDED" },
  });
}
