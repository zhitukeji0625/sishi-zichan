import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep demo auction LIVE for testing when it has expired or ended. */
export async function refreshDemoAuction() {
  const demoUser = await prisma.endUser.findUnique({
    where: { phone: DEMO_USER_PHONE },
    select: { id: true },
  });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const now = new Date();
  const needsRefresh =
    reg.project.status === "ENDED" || reg.project.endsAt.getTime() <= now.getTime();
  if (!needsRefresh) return;

  await prisma.auctionResult.deleteMany({ where: { projectId: reg.projectId } });
  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: {
      status: "LIVE",
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
