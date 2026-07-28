import { prisma } from "@/lib/prisma";

const DEMO_USER_PHONE = "13800138000";
const DEMO_ASSET_NAME = "团部东侧闲置地块";

/** Keep a LIVE demo auction for local/cron smoke tests after status refresh ends expired projects. */
export async function ensureDemoLiveAuction() {
  if (process.env.NODE_ENV === "production") return;

  const now = new Date();
  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE", endsAt: { gt: now } },
  });
  if (live) {
    await ensureDemoRegistration(live.id);
    return;
  }

  const asset = await prisma.asset.findFirst({ where: { name: DEMO_ASSET_NAME } });
  if (!asset) return;

  const starts = new Date(now.getTime() - 60_000);
  const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let project = await prisma.auctionProject.findFirst({
    where: { assetId: asset.id },
    orderBy: { createdAt: "desc" },
  });

  if (project) {
    project = await prisma.auctionProject.update({
      where: { id: project.id },
      data: { status: "LIVE", startsAt: starts, endsAt: ends },
    });
  } else {
    project = await prisma.auctionProject.create({
      data: {
        code: `AP${Date.now()}`,
        assetId: asset.id,
        startPrice: 8000,
        bidStep: 200,
        startsAt: starts,
        endsAt: ends,
        depositAmount: 500,
        status: "LIVE",
      },
    });
  }

  await ensureDemoRegistration(project.id);
}

async function ensureDemoRegistration(projectId: string) {
  const demoUser = await prisma.endUser.findUnique({ where: { phone: DEMO_USER_PHONE } });
  if (!demoUser) return;
  await prisma.auctionRegistration.upsert({
    where: { projectId_endUserId: { projectId, endUserId: demoUser.id } },
    update: { status: "APPROVED", depositPaid: true },
    create: {
      projectId,
      endUserId: demoUser.id,
      status: "APPROVED",
      depositPaid: true,
    },
  });
}
