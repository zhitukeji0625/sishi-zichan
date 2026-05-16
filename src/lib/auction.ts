import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 下一口最低可出价：无历史最高价时为起拍价，否则为当前最高 + 加价幅度。 */
export function computeMinimumNextBid(params: {
  highestAmount: Decimal | null;
  startPrice: Decimal;
  bidStep: Decimal;
}): Decimal {
  const { highestAmount, startPrice, bidStep } = params;
  return highestAmount
    ? new Decimal(highestAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());
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
      highestAmount: top ? new Decimal(top.amount.toString()) : null,
      startPrice: new Decimal(project.startPrice.toString()),
      bidStep: new Decimal(project.bidStep.toString()),
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
