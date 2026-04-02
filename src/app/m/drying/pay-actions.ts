"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

export async function payDryingDepositAction(reservationId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const reservation = await prisma.dryingReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.endUserId !== user.id) {
    return { error: "预约不存在" };
  }
  if (reservation.status !== "APPROVED") {
    return { error: "当前状态不可支付" };
  }
  const existingPayment = await prisma.payment.findFirst({
    where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
  });
  if (existingPayment) {
    return { ok: true as const };
  }
  const depositAmount = 200;
  const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderNo,
        amount: depositAmount,
        purpose: "DRYING_DEPOSIT",
        status: "SUCCESS",
        endUserId: user.id,
        reservationId,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
    await tx.dryingReservation.update({
      where: { id: reservationId },
      data: { status: "CONTRACT_PENDING" },
    });
  });
  revalidatePath("/m/orders");
  revalidatePath("/m/drying");
  return { ok: true as const };
}
