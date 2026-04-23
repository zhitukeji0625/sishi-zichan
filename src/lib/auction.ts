import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 下一口最低可接受出价（无历史出价时为起拍价）。便于单测与复用。 */
export function getMinimumNextBidAmount(params: {
  startPrice: Decimal | string;
  bidStep: Decimal | string;
  highestBidAmount: Decimal | string | null;
}): Decimal {
  const step = new Decimal(params.bidStep.toString());
  const start = new Decimal(params.startPrice.toString());
  if (params.highestBidAmount == null) {
    return start;
  }
  return new Decimal(params.highestBidAmount.toString()).plus(step);
}

export function assertBidMeetsMinimum(params: {
  amount: Decimal;
  startPrice: Decimal | string;
  bidStep: Decimal | string;
  highestBidAmount: Decimal | string | null;
}) {
  const minNext = getMinimumNextBidAmount({
    startPrice: params.startPrice,
    bidStep: params.bidStep,
    highestBidAmount: params.highestBidAmount,
  });
  if (params.amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
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
    assertBidMeetsMinimum({
      amount,
      startPrice: project.startPrice,
      bidStep: project.bidStep,
      highestBidAmount: top ? top.amount : null,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
