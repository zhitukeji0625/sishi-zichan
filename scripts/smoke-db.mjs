/** Ensure at least one LIVE auction project exists for smoke tests. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ends = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const starts = new Date(Date.now() - 60_000);

const result = await prisma.auctionProject.updateMany({
  where: { status: { in: ["ENDED", "LIVE", "SCHEDULED"] } },
  data: { status: "LIVE", startsAt: starts, endsAt: ends },
});

console.log(`smoke-db: set ${result.count} auction project(s) to LIVE`);
await prisma.$disconnect();
