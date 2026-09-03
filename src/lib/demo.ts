import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** 演示竞拍过期且无已签合同时，自动恢复为 LIVE 以便持续演示。 */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({
    where: { phone: DEMO_USER_PHONE },
  });
  if (!demoUser) return;

  const registration = await prisma.auctionRegistration.findFirst({
    where: { endUserId: demoUser.id },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  const project = registration?.project;
  if (!project || project.status !== "ENDED") return;

  const signedContract = await prisma.contract.findFirst({
    where: { auctionProjectId: project.id, status: "SIGNED" },
  });
  if (signedContract) return;

  const now = Date.now();
  await prisma.auctionProject.update({
    where: { id: project.id },
    data: {
      status: "LIVE",
      startsAt: new Date(now - 60_000),
      endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
