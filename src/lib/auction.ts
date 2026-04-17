import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 下一口最低可出价（无历史出价时为起拍价，否则为当前最高价加价幅）。 */
export function computeMinimumNextBid(params: {
  startPrice: Decimal | string;
  bidStep: Decimal | string;
  highestBidAmount: Decimal | string | null;
}) {
  const { startPrice, bidStep, highestBidAmount } = params;
  const start = new Decimal(startPrice.toString());
  const step = new Decimal(bidStep.toString());
  if (highestBidAmount == null) {
    return start;
  }
  return new Decimal(highestBidAmount.toString()).plus(step);
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
    const minNext = computeMinimumNextBid({
      startPrice: project.startPrice,
      bidStep: project.bidStep,
      highestBidAmount: top ? top.amount : null,
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
