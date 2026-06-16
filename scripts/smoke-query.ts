import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const mode = process.argv[2];

async function main() {
  if (mode === "auction") {
    const proj = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
    });
    if (!proj) {
      console.log("");
      return;
    }
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: proj.id },
      orderBy: { amount: "desc" },
    });
    const start = Number(proj.startPrice);
    const step = Number(proj.bidStep);
    const min = top ? Number(top.amount) + step : start;
    console.log(`${proj.id} ${min}`);
  } else if (mode === "listing") {
    const l = await prisma.dryingFieldListing.findFirst({ where: { status: "OPERATING" } });
    console.log(l?.id ?? "");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
