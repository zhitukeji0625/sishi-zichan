import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.log(0);
    return;
  }
  const p = new PrismaClient();
  const project = await p.auctionProject.findUnique({ where: { id: projectId } });
  if (!project || project.status !== "LIVE") {
    console.log(0);
    await p.$disconnect();
    return;
  }
  const top = await p.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  const min = top
    ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
  console.log(min.toNumber());
  await p.$disconnect();
}

main().catch(() => {
  console.log(0);
  process.exit(1);
});
