import { Decimal } from "@prisma/client/runtime/library";
import {
  assertBidAmountAtLeastMin,
  computeMinNextBidAmount,
  validatePlaceBidPrerequisites,
} from "@/lib/auction-logic";
import { prisma } from "@/lib/prisma";

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
    validatePlaceBidPrerequisites(project, reg);
    const top = await tx.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const minNext = computeMinNextBidAmount(
      project!.startPrice,
      project!.bidStep,
      top?.amount ?? null,
    );
    assertBidAmountAtLeastMin(amount, minNext);
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
