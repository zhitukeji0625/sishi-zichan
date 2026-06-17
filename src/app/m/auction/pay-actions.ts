"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

export async function payAuctionDepositAction(projectId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const project = await prisma.auctionProject.findUnique({ where: { id: projectId } });
  if (!project) return { error: "项目不存在" };
  if (project.status !== "SCHEDULED" && project.status !== "LIVE") {
    return { error: "项目状态不允许缴纳保证金" };
  }
  const orderNo = `MOCK${Date.now()}`;
  const paid = await prisma.$transaction(async (tx) => {
    const registration = await tx.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId, endUserId: user.id } },
    });
    if (!registration || registration.status !== "APPROVED") {
      return { error: "报名未通过审核" } as const;
    }
    if (registration.depositPaid) {
      return { ok: true } as const;
    }
    await tx.payment.create({
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
    await tx.auctionRegistration.update({
      where: { projectId_endUserId: { projectId, endUserId: user.id } },
      data: { depositPaid: true },
    });
    return { ok: true } as const;
  });
  if ("error" in paid) return paid;
  revalidatePath(`/m/auction/${projectId}`);
  return { ok: true as const };
}
