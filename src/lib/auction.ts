import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 下一笔有效出价的最低金额（首笔为起拍价，之后为当前最高价加价幅）。 */
export function computeMinNextBidAmount(params: {
  startPrice: Decimal | string | number;
  bidStep: Decimal | string | number;
  highestBidAmount: Decimal | string | number | null | undefined;
}): Decimal {
  const start = new Decimal(params.startPrice.toString());
  const step = new Decimal(params.bidStep.toString());
  const top = params.highestBidAmount;
  if (top == null) return start;
  return new Decimal(top.toString()).plus(step.toString());
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
    const minNext = computeMinNextBidAmount({
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
