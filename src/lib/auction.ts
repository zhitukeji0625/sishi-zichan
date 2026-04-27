import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

export async function getHighestBid(projectId: string) {
  const top = await prisma.auctionBid.findFirst({
    where: { projectId },
    orderBy: { amount: "desc" },
  });
  return top?.amount ?? null;
}

/** 下一笔有效出价的最低金额（无历史出价时为起拍价）。 */
export function getNextMinimumBidAmount(
  project: { startPrice: Decimal; bidStep: Decimal },
  highestBidAmount: Decimal | null,
): Decimal {
  return highestBidAmount
    ? new Decimal(highestBidAmount.toString()).plus(project.bidStep.toString())
    : new Decimal(project.startPrice.toString());
}

/** 校验出价上下文与金额；通过后再写入数据库。 */
export function validatePlaceBidInput(args: {
  project: { status: string; startPrice: Decimal; bidStep: Decimal } | null;
  reg: { status: string; depositPaid: boolean } | null;
  amount: Decimal;
  highestBidAmount: Decimal | null;
}): void {
  const { project, reg, amount, highestBidAmount } = args;
  if (!project || project.status !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (!reg || reg.status !== "APPROVED" || !reg.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = getNextMinimumBidAmount(project, highestBidAmount);
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
    validatePlaceBidInput({
      project,
      reg,
      amount,
      highestBidAmount: top?.amount ?? null,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
