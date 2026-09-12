import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const proj = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    select: { id: true, startPrice: true, bidStep: true },
  });
  const listing = await prisma.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    select: { id: true },
  });
  const org = await prisma.organization.findFirst({ select: { id: true } });
  console.log(
    JSON.stringify({
      projectId: proj?.id,
      startPrice: proj?.startPrice?.toString(),
      bidStep: proj?.bidStep?.toString(),
      listingId: listing?.id,
      orgId: org?.id,
    }),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
