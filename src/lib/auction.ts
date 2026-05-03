import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

type BidPricingFields = {
  startPrice: { toString(): string };
  bidStep: { toString(): string };
};

/** 无历史出价时为起拍价，否则为当前最高价加价幅（与 placeBid 一致） */
export function minRequiredBidAmount(
  project: BidPricingFields,
  highestBidAmount: Decimal | null,
): Decimal {
  const start = new Decimal(project.startPrice.toString());
  const step = new Decimal(project.bidStep.toString());
  if (highestBidAmount === null) return start;
  return highestBidAmount.plus(step);
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
    const topAmt = top ? new Decimal(top.amount.toString()) : null;
    const minNext = minRequiredBidAmount(project, topAmt);
    if (amount.lessThan(minNext)) {
      throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
    }
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
