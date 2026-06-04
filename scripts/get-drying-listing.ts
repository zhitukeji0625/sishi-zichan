import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const listing = await p.dryingFieldListing.findFirst({
    where: { status: "OPERATING" },
    select: { id: true },
  });
  if (listing) process.stdout.write(listing.id);
  await p.$disconnect();
}

main().catch(() => process.exit(1));
