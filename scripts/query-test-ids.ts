import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

async function main() {
  const p = new PrismaClient();
  const proj = await p.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
  });
  const listing = await p.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
  });
  let bidAmount = "8000";
  if (proj) {
    const top = await p.auctionBid.findFirst({
      where: { projectId: proj.id },
      orderBy: { amount: "desc" },
    });
    const start = proj.startPrice;
    const step = proj.bidStep;
    const min = top ? top.amount.add(step) : start;
    bidAmount = min.toString();
  }
  console.log(
    JSON.stringify({
      projectId: proj?.id ?? "",
      listingId: listing?.id ?? "",
      bidAmount,
    }),
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
