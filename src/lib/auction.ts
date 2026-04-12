import type { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

export async function getHighestBid(projectId: string) {
  const top = await prisma.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  return top?.amount ?? null;
}

export async function placeBid(params: {
  projectId: string;
  endUserId: string;
  amount: Decimal;
  /** 测试或嵌套事务时注入；默认使用 prisma 事务 */
  tx?: Prisma.TransactionClient;
}) {
  const { projectId, endUserId, amount, tx } = params;

  const run = async (db: Prisma.TransactionClient) => {
    const project = await db.auctionProject.findUnique({ where: { id: projectId } });
    if (!project || project.status !== "LIVE") {
      throw new Error("竞拍未在进行中");
    }
    const reg = await db.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId } },
    });
    if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
      throw new Error("无出价资格，请完成报名与保证金");
    }
    const top = await db.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const minNext = top
      ? new Decimal(top.amount.toString()).plus(project.bidStep.toString())
      : new Decimal(project.startPrice.toString());
    if (amount.lessThan(minNext)) {
      throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
    }
    const bid = await db.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  };

  if (tx) return run(tx);
  return prisma.$transaction((inner) => run(inner));
}
