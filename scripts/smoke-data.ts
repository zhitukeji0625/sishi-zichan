import { prisma } from "../src/lib/prisma";

async function main() {
  const project = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    select: { id: true, startPrice: true, bidStep: true },
  });
  if (project) {
    const top = await prisma.auctionBid.findFirst({
      where: { projectId: project.id },
      orderBy: { amount: "desc" },
    });
    const min = top
      ? Number(top.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    console.log(`${project.id} ${min}`);
  }

  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    select: { id: true },
  });
  if (listing) console.log(`LISTING:${listing.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
