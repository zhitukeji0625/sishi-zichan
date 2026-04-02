"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

export async function payAuctionDepositAction(projectId: string) {
  const user = await getCurrentEndUser();
  if (!user) return;
  const project = await prisma.auctionProject.findUnique({ where: { id: projectId } });
  if (!project) return;
  const orderNo = `MOCK${Date.now()}`;
  await prisma.payment.create({
    data: {
      orderNo,
      amount: project.depositAmount,
      purpose: "AUCTION_DEPOSIT",
      status: "SUCCESS",
      endUserId: user.id,
      auctionProjectId: projectId,
      paidAt: new Date(),
      channel: "ABC_MOCK",
    },
  });
  await prisma.auctionRegistration.updateMany({
    where: { projectId, endUserId: user.id },
    data: { depositPaid: true },
  });
  revalidatePath(`/m/auction/${projectId}`);
}
