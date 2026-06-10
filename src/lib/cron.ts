import { prisma } from "@/lib/prisma";

/** Advance auction project statuses by time (called from server layouts). */
export async function refreshAuctionProjectStatuses() {
  try {
    const now = new Date();
    await prisma.auctionProject.updateMany({
      where: { status: "SCHEDULED", startsAt: { lte: now } },
      data: { status: "LIVE" },
    });
    await prisma.auctionProject.updateMany({
      where: { status: "LIVE", endsAt: { lte: now } },
      data: { status: "ENDED" },
    });
  } catch {
    // DB unavailable — page should still render with current statuses
  }
}
