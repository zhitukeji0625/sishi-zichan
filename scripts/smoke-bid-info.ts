import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const proj = await prisma.auctionProject.findFirst({
    where: { status: "LIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!proj) {
    process.exit(1);
  }
  const top = await prisma.auctionBid.findFirst({
    where: { projectId: proj.id },
    orderBy: { amount: "desc" },
  });
  const minBid = top
    ? Number(top.amount) + Number(proj.bidStep)
    : Number(proj.startPrice);
  console.log(`${proj.id} ${minBid}`);
}

main()
  .catch(() => process.exit(1))
  .finally(() => prisma.$disconnect());
