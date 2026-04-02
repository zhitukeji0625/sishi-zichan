"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

export async function markMessageReadAction(messageId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const msg = await prisma.messageLog.findUnique({ where: { id: messageId } });
  if (!msg || msg.endUserId !== user.id) return { error: "消息不存在" };
  if (msg.status === "READ") return { ok: true as const };
  await prisma.messageLog.update({
    where: { id: messageId },
    data: { status: "READ" },
  });
  revalidatePath("/m/me");
  return { ok: true as const };
}

export async function markAllMessagesReadAction() {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  await prisma.messageLog.updateMany({
    where: { endUserId: user.id, status: "SENT" },
    data: { status: "READ" },
  });
  revalidatePath("/m/me");
  return { ok: true as const };
}
