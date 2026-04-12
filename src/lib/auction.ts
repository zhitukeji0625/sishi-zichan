import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 当前最高价与起拍价、加价幅度下的最低可接受出价（纯逻辑，便于单测）。 */
export function computeNextMinimumBid(params: {
  highestBidAmount: Decimal | null | undefined;
  startPrice: Decimal | string;
  bidStep: Decimal | string;
}) {
  const { highestBidAmount, startPrice, bidStep } = params;
  const step = new Decimal(bidStep.toString());
  const start = new Decimal(startPrice.toString());
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
    const minNext = computeNextMinimumBid({
      highestBidAmount: top?.amount,
      startPrice: project.startPrice,
      bidStep: project.bidStep,
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
