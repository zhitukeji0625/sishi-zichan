import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/**
 * Keep the seed demo auction usable: when it has ended (including published results),
 * reset it to LIVE with fresh dates so H5 bidding smoke tests keep working.
 */
export async function refreshDemoAuctionIfExpired() {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  const now = new Date();
  const registrations = await prisma.auctionRegistration.findMany({
    where: { endUserId: demoUser.id, status: "APPROVED", depositPaid: true },
    include: { project: { include: { result: true } } },
  });

  for (const reg of registrations) {
    const project = reg.project;
    const expired =
      project.status !== "LIVE" ||
      project.endsAt <= now ||
      project.result?.status === "PUBLISHED";
    if (!expired) continue;

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { auctionProjectId: project.id } });
      await tx.contract.deleteMany({ where: { auctionProjectId: project.id } });
      await tx.auctionBid.deleteMany({ where: { projectId: project.id } });
      if (project.result) {
        await tx.auctionResult.delete({ where: { projectId: project.id } });
      }
      await tx.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(now.getTime() - 60_000),
          endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });
  }
}
