/**
 * Helper for smoke-test.sh to query DB without top-level await issues.
 * Usage: npx tsx scripts/db-query.ts <query>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const query = process.argv[2];
  if (query === "live-auction") {
    const proj = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      select: { id: true, startPrice: true, bidStep: true },
    });
    if (proj) {
      const top = await prisma.auctionBid.findFirst({
        where: { projectId: proj.id },
        orderBy: { amount: "desc" },
      });
      const min = top
        ? Number(top.amount) + Number(proj.bidStep)
        : Number(proj.startPrice);
      console.log(`${proj.id} ${min}`);
    }
  } else if (query === "operating-listing") {
    const l = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
      select: { id: true },
    });
    if (l) console.log(l.id);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
