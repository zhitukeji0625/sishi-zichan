import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  // 确保演示竞拍处于 LIVE 状态
  const demoUser = await prisma.endUser.findUnique({ where: { phone: "13800138000" } });
  let project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });

  if (!project) {
    project = await prisma.auctionProject.findFirst({
      orderBy: { createdAt: "desc" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (project) {
      await prisma.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(Date.now() - 60 * 1000),
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      project.status = "LIVE";
    }
  }

  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });

  if (!project) {
    console.log(JSON.stringify({ error: "no auction project" }));
    return;
  }

  const startPrice = new Decimal(project.startPrice.toString());
  const bidStep = new Decimal(project.bidStep.toString());
  const topBid = project.bids[0]?.amount;
  const bidAmount = topBid
    ? new Decimal(topBid.toString()).add(bidStep)
    : startPrice;

  if (demoUser) {
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

  console.log(
    JSON.stringify({
      projectId: project.id,
      bidAmount: Number(bidAmount.toString()),
      listingId: listing?.id ?? null,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
