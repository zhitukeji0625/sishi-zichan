"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { notifyUser } from "@/lib/messages";

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function signContractAction(contractId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract || contract.endUserId !== user.id) {
    return { error: "合同不存在" };
  }
  if (contract.status !== "DRAFT") {
    return { error: "合同状态不可签署" };
  }
  await prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: contractId },
      data: {
        status: "SIGNED",
        effectiveAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });
    if (contract.reservationId) {
      await tx.dryingReservation.update({
        where: { id: contract.reservationId },
        data: { status: "ACTIVE" },
      });
    }
  });
  await notifyUser(user.id, "合同已签署", "您的合同已签署成功。", "CONTRACT_SIGNED");
  revalidatePath("/m/contract");
  revalidatePath("/m/orders");
  return { ok: true as const };
}

export async function createAuctionContractAction(projectId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const result = await prisma.auctionResult.findUnique({
    where: { projectId },
    include: { project: { include: { asset: { include: { org: true } } } } },
  });
  if (!result || result.status !== "PUBLISHED" || result.winnerId !== user.id) {
    return { error: "无权签署" };
  }
  const existing = await prisma.contract.findFirst({
    where: { auctionProjectId: projectId, endUserId: user.id },
  });
  if (existing) return { ok: true as const, contractId: existing.id };
  const template = await prisma.contractTemplate.findFirst({
    where: { type: "AUCTION_LEASE", active: true },
  });
  const htmlBody = template
    ? template.bodyHtml
        .replace("{{orgName}}", escapeHtml(result.project.asset.org?.name ?? "甲方"))
        .replace("{{userName}}", escapeHtml(user.name ?? user.phone))
        .replace("{{assetName}}", escapeHtml(result.project.asset.name))
        .replace("{{leaseTerm}}", escapeHtml(result.project.leaseTermDesc ?? "以合同约定为准"))
    : `<p>竞拍合同：${escapeHtml(result.project.asset.name)}</p>`;
  const contract = await prisma.contract.create({
    data: {
      type: "AUCTION_LEASE",
      endUserId: user.id,
      auctionProjectId: projectId,
      htmlBody,
      status: "DRAFT",
    },
  });
  return { ok: true as const, contractId: contract.id };
}

export async function createDryingContractAction(reservationId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const reservation = await prisma.dryingReservation.findUnique({
    where: { id: reservationId },
    include: { listing: { include: { asset: true } } },
  });
  if (!reservation || reservation.endUserId !== user.id) {
    return { error: "预约不存在" };
  }
  if (reservation.status !== "CONTRACT_PENDING") {
    return { error: "当前状态不可签署合同" };
  }
  const existing = await prisma.contract.findFirst({
    where: { reservationId, endUserId: user.id },
  });
  if (existing) return { ok: true as const, contractId: existing.id };
  const htmlBody = `<p>晒场租赁合同</p><p>晒场：${escapeHtml(reservation.listing.asset.name)}</p><p>使用时段：${reservation.startDate.toISOString().slice(0, 10)} — ${reservation.endDate.toISOString().slice(0, 10)}</p><p>承租人：${escapeHtml(user.name ?? user.phone)}</p>`;
  const contract = await prisma.contract.create({
    data: {
      type: "DRYING_LEASE",
      endUserId: user.id,
      reservationId,
      htmlBody,
      status: "DRAFT",
    },
  });
  return { ok: true as const, contractId: contract.id };
}

export async function payAuctionRentAction(projectId: string) {
  const user = await getCurrentEndUser();
  if (!user) return { error: "请先登录" };
  const result = await prisma.auctionResult.findUnique({
    where: { projectId },
    include: { project: true },
  });
  if (!result || result.winnerId !== user.id || result.status !== "PUBLISHED") {
    return { error: "无权操作" };
  }
  const topBid = await prisma.auctionBid.findFirst({
    where: { projectId, endUserId: user.id },
    orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
  });
  if (!topBid) return { error: "未找到出价记录" };
  const existingPayment = await prisma.payment.findFirst({
    where: { auctionProjectId: projectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
  });
  if (existingPayment) return { ok: true as const };
  const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await prisma.payment.create({
    data: {
      orderNo,
      amount: topBid.amount,
      purpose: "AUCTION_RENT",
      status: "SUCCESS",
      endUserId: user.id,
      auctionProjectId: projectId,
      paidAt: new Date(),
      channel: "ABC_MOCK",
    },
  });
  await notifyUser(user.id, "租金支付成功", `项目 ${result.project.code} 租金已支付。`, "RENT_PAID");
  revalidatePath(`/m/auction/${projectId}`);
  revalidatePath("/m/orders");
  return { ok: true as const };
}
