import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const live = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
  });
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  if (!live || !listing) {
    console.log("SKIP");
    return;
  }
  const top = live.bids[0]?.amount
    ? Number(live.bids[0].amount)
    : Number(live.startPrice);
  const step = Number(live.bidStep);
  const minBid = live.bids.length ? top + step : Number(live.startPrice);

  const start = new Date();
  start.setDate(start.getDate() + 10);
  const end = new Date();
  end.setDate(end.getDate() + 11);

  console.log(
    JSON.stringify({
      projectId: live.id,
      minBid,
      listingId: listing.id,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    }),
  );
}

main()
  .catch(() => console.log("SKIP"))
  .finally(() => prisma.$disconnect());
