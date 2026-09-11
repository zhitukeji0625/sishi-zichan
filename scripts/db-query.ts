import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const mode = process.argv[2] ?? "all";

async function main() {
  if (mode === "live-project") {
    const now = new Date();
    const p = await prisma.auctionProject.findFirst({
      where: { status: "LIVE", endsAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { id: true, startPrice: true, bidStep: true },
    });
    if (!p) process.exit(1);
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: p.id },
      orderBy: { amount: "desc" },
      select: { amount: true },
    });
    const start = Number(p.startPrice);
    const step = Number(p.bidStep);
    const minBid = top ? Number(top.amount) + step : start;
    console.log(JSON.stringify({ ...p, minBid }));
    return;
  }
  if (mode === "drying-listing") {
    const l = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
      select: { id: true },
    });
    if (!l) process.exit(1);
    console.log(l.id);
    return;
  }
  const projects = await prisma.auctionProject.findMany({
    select: { id: true, code: true, status: true, endsAt: true },
  });
  const listings = await prisma.dryingFieldListing.findMany({
    select: { id: true, status: true },
  });
  console.log(JSON.stringify({ projects, listings }, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
