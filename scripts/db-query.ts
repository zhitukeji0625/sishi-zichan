#!/usr/bin/env npx tsx
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cmd = process.argv[2];
  if (cmd === "live-project") {
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (!project) {
      console.log("");
      return;
    }
    const top = project.bids[0]?.amount;
    const start = Number(project.startPrice);
    const step = Number(project.bidStep);
    const minBid = top ? Number(top) + step : start;
    console.log(JSON.stringify({ id: project.id, minBid }));
    return;
  }
  if (cmd === "drying-listing") {
    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    console.log(listing?.id ?? "");
    return;
  }
  console.error("Usage: db-query.ts live-project | drying-listing");
  process.exit(1);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
