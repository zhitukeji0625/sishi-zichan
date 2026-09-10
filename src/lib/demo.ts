import { prisma } from "@/lib/prisma";

/** Keep the seed demo auction playable when it has ended (cron / time drift). */
export async function refreshDemoAuctionIfExpired() {
  const now = new Date();
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!project) return;
  const expired = project.status === "ENDED" || project.endsAt <= now;
  if (!expired) return;
  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt, endsAt },
  });
}
