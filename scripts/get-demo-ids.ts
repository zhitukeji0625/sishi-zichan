import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const bidInfo = args.includes("--bid-info");

  let project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      bids: { orderBy: { amount: "desc" }, take: 1 },
    },
  });

  if (!project) {
    project = await prisma.auctionProject.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        bids: { orderBy: { amount: "desc" }, take: 1 },
      },
    });
    if (project && project.status !== "LIVE") {
      const now = new Date();
      await prisma.auctionProject.update({
        where: { id: project.id },
        data: {
          status: "LIVE",
          startsAt: new Date(now.getTime() - 60_000),
          endsAt: new Date(now.getTime() + 7 * 86400_000),
        },
      });
      project.status = "LIVE";
    }
  }

  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    orderBy: { createdAt: "desc" },
  });

  if (project) {
    console.log(`projectId=${project.id}`);
    if (bidInfo) {
      const top = project.bids[0]?.amount ?? project.startPrice;
      const minBid = top instanceof Decimal ? top.add(project.bidStep) : new Decimal(top).add(project.bidStep);
      console.log(`minBid=${minBid.toString()}`);
    }
  }
  if (listing) {
    console.log(`listingId=${listing.id}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
