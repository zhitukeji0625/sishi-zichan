import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Restore seed demo auction to LIVE when expired (keeps H5 demo bid flow working). */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({
    where: { phone: DEMO_USER_PHONE },
  });
  if (!demoUser) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: {
      endUserId: demoUser.id,
      depositPaid: true,
      status: "APPROVED",
    },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg) return;

  const { project } = reg;
  const now = new Date();
  if (project.status === "LIVE" && project.endsAt > now) return;

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });
}
