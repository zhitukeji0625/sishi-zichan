/** 查询 LIVE 竞拍项目及最低出价，供 smoke-test.sh 使用 */
import { PrismaClient } from "@prisma/client";

(async () => {
  const prisma = new PrismaClient();
  try {
    const project = await prisma.auctionProject.findFirst({
      where: { status: "LIVE" },
      orderBy: { createdAt: "desc" },
      include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
    });
    if (!project) {
      process.exit(1);
    }
    const top = project.bids[0]?.amount;
    const minBid = top
      ? Number(top) + Number(project.bidStep)
      : Number(project.startPrice);
    console.log(`${project.id}|${minBid}`);
  } finally {
    await prisma.$disconnect();
  }
})();
