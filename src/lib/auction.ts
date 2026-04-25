import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 当前最低可接受出价（首口价 = 起拍价，否则 = 当前最高价 + 加价幅度） */
export function minNextBidAmount(params: {
  highestBidAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestBidAmount, startPrice, bidStep } = params;
  if (highestBidAmount !== null) {
    return new Decimal(highestBidAmount.toString()).plus(bidStep.toString());
  }
  return new Decimal(startPrice.toString());
}

export function assertBidMeetsMinimum(amount: Decimal, minNext: Decimal): void {
  if (amount.lessThan(minNext)) {
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
    const minNext = minNextBidAmount({
      highestBidAmount: top ? new Decimal(top.amount.toString()) : null,
      startPrice: new Decimal(project.startPrice.toString()),
      bidStep: new Decimal(project.bidStep.toString()),
    });
    assertBidMeetsMinimum(amount, minNext);
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
