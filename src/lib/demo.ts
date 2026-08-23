import { prisma } from "@/lib/prisma";

/** Keep demo auction playable: clear stale results and reset ENDED demo projects to LIVE. */
export async function refreshDemoAuction() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const regs = await prisma.auctionRegistration.findMany({
    where: { endUserId: demoUser.id },
    select: { projectId: true },
  });
  const projectIds = regs.map((r) => r.projectId);
  if (projectIds.length === 0) return;

  const ended = await prisma.auctionProject.findMany({
    where: { id: { in: projectIds }, status: "ENDED" },
    select: { id: true },
  });
  if (ended.length === 0) return;

  const ids = ended.map((p) => p.id);
  await prisma.auctionResult.deleteMany({ where: { projectId: { in: ids } } });

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.updateMany({
    where: { id: { in: ids } },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
