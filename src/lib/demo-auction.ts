import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Keep at least one LIVE demo auction in non-production after status refresh. */
export async function ensureDemoLiveAuction() {
  if (process.env.NODE_ENV === "production") return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const project = await prisma.auctionProject.findFirst({ orderBy: { createdAt: "asc" } });
  if (!project) return;

  const now = new Date();
  const windowStale = project.endsAt <= now || project.startsAt > now;
  if (project.status === "ENDED" || windowStale) {
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: {
        status: "LIVE",
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  } else if (project.status === "SCHEDULED" && project.startsAt <= now) {
    await prisma.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE" },
    });
  }

  await prisma.auctionRegistration.upsert({
    where: {
      projectId_endUserId: { projectId: project.id, endUserId: demoUser.id },
    },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
