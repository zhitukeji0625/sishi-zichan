import { PrismaClient, Decimal } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cmd = process.argv[2];
  if (cmd === "project-id") {
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE", endsAt: { gt: new Date() } },
      select: { id: true },
    });
    if (project) console.log(project.id);
    return;
  }
  if (cmd === "min-bid") {
    const projectId = process.argv[3];
    if (!projectId) return;
    const project = await prisma.auctionProject.findUnique({
      where: { id: projectId },
      select: { startPrice: true, bidStep: true },
    });
    const top = await prisma.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
      select: { amount: true },
    });
    if (!project) return;
    const min = top
      ? new Decimal(top.amount).plus(project.bidStep)
      : new Decimal(project.startPrice);
    console.log(min.toNumber());
    return;
  }
  if (cmd === "listing-id") {
    const listing = await prisma.dryingFieldListing.findFirst({
      where: { status: "OPERATING" },
      select: { id: true },
    });
    if (listing) console.log(listing.id);
    return;
  }
  if (cmd === "refresh-demo") {
    const expired = await prisma.auctionProject.findMany({
      where: {
        OR: [{ status: "ENDED" }, { endsAt: { lt: new Date() } }],
      },
      take: 5,
    });
    for (const p of expired) {
      await prisma.auctionProject.update({
        where: { id: p.id },
        data: {
          status: "LIVE",
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }
    console.log(`refreshed ${expired.length} projects`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
