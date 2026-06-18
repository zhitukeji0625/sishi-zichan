import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const auctions = await p.auctionProject.findMany({
  select: { id: true, status: true, endsAt: true, code: true, startPrice: true, bidStep: true },
});
const dict = await p.dictCategory.count();
const listings = await p.dryingFieldListing.findMany({ select: { id: true, status: true } });
console.log(JSON.stringify({ auctions, dict, listings }, null, 2));
await p.$disconnect();
