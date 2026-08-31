import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    if (!project) {
      console.error("no live project");
      process.exit(1);
    }
    const top = project.bids[0];
    const minBid = top
      ? Number(top.amount) + Number(project.bidStep)
      : Number(project.startPrice);
    console.log(project.id);
    console.log(minBid);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
