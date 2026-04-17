import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/** 校验出价规则（可单测）；`placeBid` 在落库前会调用。 */
export function validateAuctionBidAmount(params: {
  projectStatus: string;
  startPrice: Decimal;
  bidStep: Decimal;
  registration: { status: string; depositPaid: boolean } | null;
  topBidAmount: Decimal | null;
  amount: Decimal;
}) {
  const { projectStatus, startPrice, bidStep, registration, topBidAmount, amount } =
    params;
  if (projectStatus !== "LIVE") {
    throw new Error("竞拍未在进行中");
  }
  if (!registration || registration.status !== "APPROVED" || !registration.depositPaid) {
    throw new Error("无出价资格，请完成报名与保证金");
  }
  const minNext = topBidAmount
    ? new Decimal(topBidAmount.toString()).plus(bidStep.toString())
    : new Decimal(startPrice.toString());
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
    if (!project) {
      throw new Error("竞拍未在进行中");
    }
    const reg = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId } },
    });
    const top = await tx.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    validateAuctionBidAmount({
      projectStatus: project.status,
      startPrice: project.startPrice,
      bidStep: project.bidStep,
      registration: reg,
      topBidAmount: top ? new Decimal(top.amount.toString()) : null,
      amount,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
