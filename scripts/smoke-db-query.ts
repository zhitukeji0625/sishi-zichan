import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cmd = process.argv[2];
  if (cmd === "live-project") {
    const proj = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (!proj) {
      console.log("");
      return;
    }
    const minBid =
      proj.bids.length === 0
        ? proj.startPrice.toString()
        : (Number(proj.bids[0].amount) + Number(proj.bidStep)).toString();
    console.log(`${proj.id}\t${minBid}`);
  } else if (cmd === "drying-listing") {
    const l = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
    });
    console.log(l?.id ?? "");
  } else if (cmd === "auction-status") {
    const proj = await prisma.auctionProject.findFirst({
      orderBy: { createdAt: "desc" },
    });
    console.log(JSON.stringify({ id: proj?.id, status: proj?.status, endsAt: proj?.endsAt }));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
