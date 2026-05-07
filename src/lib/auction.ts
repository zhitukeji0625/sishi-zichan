import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 下一笔允许的最低出价：无出价时为起拍价，否则为当前最高价 + 加价步长 */
export function minNextBidAmount(params: {
  highestAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestAmount, startPrice, bidStep } = params;
  if (highestAmount) {
    return new Decimal(highestAmount.toString()).plus(bidStep.toString());
  }
  return new Decimal(startPrice.toString());
}

export async function getHighestBid(projectId: string) {
  const top = await prisma.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  return top?.amount ?? null;
}

/** 校验出价资格与金额（供单元测试与 placeBid 共用） */
export function validateBidRules(params: {
  project: { status: string; startPrice: Decimal | { toString(): string }; bidStep: Decimal | { toString(): string } } | null;
  registration: { status: string; depositPaid: boolean } | null;
  highestBidAmount: Decimal | null;
  amount: Decimal;
}): void {
  const { project, registration, highestBidAmount, amount } = params;
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (!registration || registration.status !== "APPROVED" || !registration.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = minNextBidAmount({
    highestAmount: highestBidAmount,
    startPrice: new Decimal(project.startPrice.toString()),
    bidStep: new Decimal(project.bidStep.toString()),
  });
  if (amount.lessThan(minNext)) {
    throw new Error(`出价需不低于 ${minNext.toFixed(2)}`);
  }
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
    validateBidRules({
      project: project
        ? {
            status: project.status,
            startPrice: project.startPrice,
            bidStep: project.bidStep,
          }
        : null,
      registration: reg,
      highestBidAmount: top ? new Decimal(top.amount.toString()) : null,
      amount,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
