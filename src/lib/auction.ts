import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 下一笔有效出价的最小金额（无出价时为起拍价，否则为当前最高 + 加价幅度） */
export function minNextBidAmount(params: {
  startPrice: Decimal | string;
  bidStep: Decimal | string;
  highestBidAmount: Decimal | string | null | undefined;
}): Decimal {
  const { startPrice, bidStep, highestBidAmount } = params;
  if (highestBidAmount == null) {
    return new Decimal(startPrice.toString());
  }
  return new Decimal(highestBidAmount.toString()).plus(bidStep.toString());
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
      highestBidAmount: top?.amount ?? null,
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
