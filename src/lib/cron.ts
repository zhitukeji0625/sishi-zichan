import { prisma } from "@/lib/prisma";

/** Advance auction project statuses by time (called from server layouts). */
export async function refreshAuctionProjectStatuses() {
  const now = new Date();
  // Projects with published results must stay ended regardless of schedule.
  await prisma.auctionProject.updateMany({
    where: {
      status: { in: ["LIVE", "SCHEDULED"] },
      result: { status: "PUBLISHED" },
    },
    data: { status: "ENDED" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now }, result: { is: null } },
    data: { status: "LIVE" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "ENDED" },
  });
}
