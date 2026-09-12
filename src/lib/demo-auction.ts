import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";

/** Ensure a LIVE demo auction exists for smoke tests and demo accounts. */
export async function refreshDemoAuctionIfStale(): Promise<void> {
  const now = new Date();
  const live = await prisma.auctionProject.findFirst({ where: { status: "LIVE" } });
  if (live && live.endsAt > now) return;

  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;

  if (live) {
    await prisma.auctionProject.update({
      where: { id: live.id },
      data: {
        status: "ENDED",
        endsAt: live.endsAt < now ? live.endsAt : now,
      },
    });
  }

  const asset = await prisma.asset.findFirst({
    where: { type: "LAND", status: { in: ["IDLE", "IN_USE"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!asset) return;

  const startsAt = new Date(now.getTime() - 60_000);
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const project = await prisma.auctionProject.create({
    data: {
      code: `AP${Date.now()}`,
      assetId: asset.id,
      startPrice: new Decimal(8000),
      bidStep: new Decimal(200),
      depositAmount: new Decimal(500),
      startsAt,
      endsAt,
      status: "LIVE",
    },
  });

  await prisma.auctionRegistration.upsert({
    where: { projectId_endUserId: { projectId: project.id, endUserId: demoUser.id } },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId: project.id,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
