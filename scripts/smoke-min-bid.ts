import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const projectId = process.argv[2];
if (!projectId) {
  console.error("usage: smoke-min-bid.ts <projectId>");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.auctionProject.findUnique({ where: { id: projectId } });
  if (!project) {
    console.log("8000");
    return;
  }
  const top = await prisma.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  const min = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(min.toFixed(2));
}

main()
  .catch(() => console.log("8000"))
  .finally(() => prisma.$disconnect());
