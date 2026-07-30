import { prisma } from "@/lib/prisma";
import { refreshDemoAuctionIfExpired } from "@/lib/demo";

/** Advance auction project statuses by time (called from server layouts). */
export async function refreshAuctionProjectStatuses() {
  if (process.env.NODE_ENV === "development") {
    await refreshDemoAuctionIfExpired();
  }
  const now = new Date();
  await prisma.auctionProject.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    data: { status: "LIVE" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "ENDED" },
  });
}
