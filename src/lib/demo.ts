import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Restore expired demo auction project to LIVE so smoke tests and demos keep working. */
export async function refreshDemoAuctionIfExpired() {
  const user = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!user) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: user.id },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg?.project) return;

  const project = reg.project;
  const now = new Date();
  if (project.status !== "ENDED" && project.endsAt > now) return;

  const starts = new Date(now.getTime() - 60_000);
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
