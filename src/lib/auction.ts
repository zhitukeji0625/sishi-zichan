import { Decimal } from "@prisma/client/runtime/library";
import {
  assertAmountMeetsMin,
  assertLiveProject,
  assertRegistrationAllowsBid,
  computeMinNextBid,
} from "@/lib/auction-core";
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
    assertLiveProject(project);
    const reg = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId } },
    });
    assertRegistrationAllowsBid(reg);
    const top = await tx.auctionBid.findFirst({
      where: { projectId },
      orderBy: { amount: "desc" },
    });
    const minNext = computeMinNextBid({
      startPrice: project.startPrice,
      bidStep: project.bidStep,
      highestAmount: top?.amount ?? null,
    });
    assertAmountMeetsMin(amount, minNext);
    const bid = await tx.auctionBid.create({
      data: { projectId, endUserId, amount },
    });
    return bid;
  });
}
