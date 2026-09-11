import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const projects = await prisma.auctionProject.findMany({
    where: { status: "LIVE" },
    select: { id: true, code: true, endsAt: true, startPrice: true, bidStep: true },
  });
  const listings = await prisma.dryingFieldListing.findMany({
    where: { status: "OPERATING" },
    select: { id: true, status: true },
  });
  console.log(JSON.stringify({ projects, listings }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
