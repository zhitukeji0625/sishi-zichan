import { prisma } from "@/lib/prisma";

/** Keep the seed demo auction usable when it has expired. */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id, depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const project = reg.project;
  const now = new Date();
  if (project.status !== "ENDED" && project.endsAt > now) return;

  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt, endsAt },
  });
}
