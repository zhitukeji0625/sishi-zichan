import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { validateBidAmount } from "@/lib/auction-validation";

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
    validateBidAmount({
      project,
      registration: reg,
      highestBidAmount: top ? new Decimal(top.amount.toString()) : null,
      startPrice: project
        ? new Decimal(project.startPrice.toString())
        : new Decimal(0),
      bidStep: project ? new Decimal(project.bidStep.toString()) : new Decimal(0),
      amount,
    });
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
