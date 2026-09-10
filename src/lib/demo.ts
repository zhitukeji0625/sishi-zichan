import { prisma } from "@/lib/prisma";

/**
 * Keep the demo auction project live for testing.
 * If the only auction has ended, extend its end time and set status back to LIVE.
 */
export async function refreshDemoAuctionIfExpired() {
  const projects = await prisma.auctionProject.findMany({
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const project = projects[0];
  if (!project || project.status !== "ENDED") return;

  const now = new Date();
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      endsAt,
      startsAt: project.startsAt > now ? project.startsAt : now,
    },
  });
}
