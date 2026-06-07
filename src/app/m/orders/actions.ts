"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { notifyUser } from "@/lib/messages";

export async function cancelReservationAction(reservationId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const reservation = await prisma.dryingReservation.findUnique({
    where: { id: reservationId },
  });
  if (!reservation || reservation.endUserId !== user.id) {
    return { error: "预约不存在" };
  }
  const updated = await prisma.dryingReservation.updateMany({
    where: {
      id: reservationId,
      endUserId: user.id,
      status: { in: ["PENDING_REVIEW", "APPROVED"] },
    },
    data: { status: "CANCELLED" },
  });
  if (updated.count === 0) return { error: "当前状态不可取消" };
  await notifyUser(user.id, "预约已取消", `您的预约 ${reservation.orderNo} 已取消。`, "RES_CANCEL");
  revalidatePath("/m/orders");
  return { ok: true as const };
}
