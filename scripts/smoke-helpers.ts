import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  // Ensure demo auction is LIVE
  await prisma.auctionProject.updateMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    data: { status: "LIVE" },
  });
  await prisma.auctionProject.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "ENDED" },
  });

  let project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });

  if (!project) {
    // Refresh expired demo auction
    const expired = await prisma.auctionProject.findFirst({
      orderBy: { createdAt: "desc" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (expired) {
      await prisma.auctionProject.update({
        where: { id: expired.id },
        data: {
          status: "LIVE",
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      project = { ...expired, status: "LIVE" as const };
    }
  }

  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    orderBy: { createdAt: "desc" },
  });

  const org = await prisma.organization.findFirst({ where: { code: "REG61" } });

  if (project) {
    const top = project.bids[0]?.amount;
    const start = Number(project.startPrice.toString());
    const step = Number(project.bidStep.toString());
    const minBid = top ? Number(top.toString()) + step : start;
    console.log(`export PROJECT_ID="${project.id}"`);
    console.log(`export MIN_BID=${minBid}`);
  }

  if (listing) console.log(`export LISTING_ID="${listing.id}"`);
  if (org) console.log(`export ORG_ID="${org.id}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
