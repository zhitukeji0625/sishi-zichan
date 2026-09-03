import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** 演示竞拍过期且无已签合同时，自动恢复为 LIVE 以便 cron/演示可继续出价 */
export async function refreshDemoAuctionIfExpired() {
  const user = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!user) return;

  const reg = await prisma.auctionRegistration.findFirst({
    where: { endUserId: user.id, status: "APPROVED", depositPaid: true },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
  if (!reg || reg.project.status !== "ENDED") return;

  const signedContract = await prisma.contract.findFirst({
    where: {
      auctionProjectId: reg.projectId,
      endUserId: user.id,
      status: "SIGNED",
    },
  });
  if (signedContract) return;

  const now = Date.now();
  await prisma.auctionProject.update({
    where: { id: reg.projectId },
    data: {
      status: "LIVE",
      startsAt: new Date(now - 60 * 1000),
      endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    },
  });
}
