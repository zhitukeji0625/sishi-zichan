import { PrismaClient } from "@prisma/client";

/** Keep seed demo auction usable when endsAt has passed (idempotent). */
export async function refreshDemoAuctionIfExpired(prisma: PrismaClient) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  if (!demoUser) return;

  const now = Date.now();
  const projects = await prisma.auctionProject.findMany({
    where: { registrations: { some: { endUserId: demoUser.id } } },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const project = projects[0];
  if (!project) return;

  const endsMs = project.endsAt.getTime();
  if (project.status !== "ENDED" && endsMs > now) return;

  const startsAt = new Date(now - 60 * 1000);
  const endsAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt, endsAt },
  });
}
