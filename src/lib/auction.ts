import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 下一笔允许的最低出价（无历史出价时为起拍价）。便于单测，不访问数据库。 */
export function minNextBidAmount(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestAmount: Decimal | string | number | null;
}): Decimal {
  const step = new Decimal(params.bidStep.toString());
  const start = new Decimal(params.startPrice.toString());
  if (params.highestAmount == null) {
    return start;
  }
  return new Decimal(params.highestAmount.toString()).plus(step);
}

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
}) {
  const { projectId, endUserId, amount } = params;
  return prisma.$transaction(async (tx) => {
    const project = await tx.auctionProject.findUnique({ where: { id: projectId } });
    if (!project || project.status !== "LIVE") {
      throw new Error("竞拍未在进行中");
    }
    const reg = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId } },
    });
    if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
      throw new Error("无出价资格，请完成报名与保证金");
    }
    const top = await tx.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const minNext = minNextBidAmount({
      startPrice: project.startPrice,
      bidStep: project.bidStep,
      highestAmount: top ? top.amount : null,
    });
    if (amount.lessThan(minNext)) {
      throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
    }
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
