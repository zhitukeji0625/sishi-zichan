import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const kind = process.argv[2];

async function main() {
  if (kind === "project") {
    const p = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (p) console.log(p.id);
  } else if (kind === "listing") {
    const l = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
      select: { id: true },
    });
    if (l) console.log(l.id);
  } else if (kind === "minbid") {
    const p = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (p) {
      const top = p.bids[0]?.amount ?? p.startPrice;
      const min = Number(top) + Number(p.bidStep);
      console.log(min);
    }
  } else if (kind === "org") {
    const o = await prisma.organization.findFirst({ where: { code: "CO101" }, select: { id: true } });
    if (o) console.log(o.id);
  }
}

main()
  .catch(() => process.exit(1))
  .finally(() => prisma.$disconnect());
