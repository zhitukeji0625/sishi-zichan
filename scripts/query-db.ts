import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const kind = process.argv[2];
  if (kind === "live-auction") {
    const proj = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      select: { id: true, startPrice: true },
    });
    if (proj) console.log(`${proj.id} ${proj.startPrice}`);
    else console.log("NONE");
  } else if (kind === "drying-listing") {
    const l = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
      select: { id: true },
    });
    console.log(l ? l.id : "NONE");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
