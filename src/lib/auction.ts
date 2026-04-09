import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

export function minNextBidAmount(
  project: { startPrice: unknown; bidStep: unknown },
  topBidAmount: Decimal | null,
): Decimal {
  const startPrice = new Decimal(String(project.startPrice));
  const bidStep = new Decimal(String(project.bidStep));
  if (!topBidAmount) {
    return startPrice;
  }
  return topBidAmount.plus(bidStep);
}

/** 校验出价资格与金额（便于单测，与 placeBid 行为一致） */
export function assertCanPlaceBid(params: {
  project: { status: string; startPrice: unknown; bidStep: unknown } | null;
  registration: { status: string; depositPaid: boolean } | null;
  topBidAmount: Decimal | null;
  amount: Decimal;
}): Decimal {
  const { project, registration, topBidAmount, amount } = params;
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (!registration || registration.status !== "APPROVED" || !registration.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = minNextBidAmount(project, topBidAmount);
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
  return minNext;
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
    const reg = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId } },
    });
    const top = await tx.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const topAmount = top ? new Decimal(top.amount.toString()) : null;
    assertCanPlaceBid({
      project,
      registration: reg,
      topBidAmount: topAmount,
      amount,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
