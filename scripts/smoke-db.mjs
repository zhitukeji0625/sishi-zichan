/**
 * Prepare database for smoke tests: ensure at least one LIVE auction project.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.auctionProject.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!project) {
    console.error("No auction project found. Run: npm run db:seed");
    process.exit(1);
  }

  const starts = new Date(Date.now() - 60 * 1000);
  const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.auctionProject.update({
    where: { id: project.id },
    data: { status: "LIVE", startsAt: starts, endsAt: ends },
  });

  console.log(`Auction ${project.code} set to LIVE (${starts.toISOString()} – ${ends.toISOString()})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
