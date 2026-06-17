import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const live = await p.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, code: true, endsAt: true, startsAt: true },
  });
  console.log("live_auction:", JSON.stringify(live, null, 2));
  const drying = await p.dryingFieldListing.findMany({
    select: { id: true, status: true },
  });
  console.log("drying:", JSON.stringify(drying, null, 2));
  console.log("assets:", await p.asset.count());
}

main()
  .then(() => p.$disconnect())
  .catch((e) => {
    console.error(e);
    p.$disconnect();
    process.exit(1);
  });
