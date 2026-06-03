import { NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

const schema = z.object({
  purpose: z.enum(["AUCTION_DEPOSIT", "AUCTION_RENT", "DRYING_DEPOSIT", "DRYING_RENT"]),
  auctionProjectId: z.string().optional(),
  reservationId: z.string().optional(),
});

function mockOrderNo() {
  return `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export async function POST(req: Request) {
  const user = await getCurrentEndUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const { purpose, auctionProjectId, reservationId } = parsed.data;

  if (purpose === "AUCTION_DEPOSIT") {
    if (!auctionProjectId) return NextResponse.json({ error: "缺少项目ID" }, { status: 400 });
    const reg = await prisma.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
    });
    if (!reg) return NextResponse.json({ error: "未报名该项目" }, { status: 403 });
    if (reg.depositPaid) return NextResponse.json({ ok: true });
    const project = await prisma.auctionProject.findUnique({ where: { id: auctionProjectId } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    const orderNo = mockOrderNo();
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.auctionRegistration.findUnique({
        where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
      });
      if (!fresh || fresh.depositPaid) return;
      await tx.payment.create({
        data: {
          orderNo,
          amount: project.depositAmount,
          purpose: "AUCTION_DEPOSIT",
          status: "SUCCESS",
          endUserId: user.id,
          auctionProjectId,
          paidAt: new Date(),
          channel: "ABC_MOCK",
        },
      });
      await tx.auctionRegistration.update({
        where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
        data: { depositPaid: true },
      });
    });
    const pay = await prisma.payment.findFirst({
      where: { orderNo, endUserId: user.id },
    });
    return NextResponse.json({ ok: true, orderNo: pay?.orderNo ?? orderNo, paidAt: pay?.paidAt ?? new Date() });
  }

  if (purpose === "AUCTION_RENT") {
    if (!auctionProjectId) return NextResponse.json({ error: "缺少项目ID" }, { status: 400 });
    const existingRent = await prisma.payment.findFirst({
      where: { auctionProjectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
    });
    if (existingRent) return NextResponse.json({ ok: true, orderNo: existingRent.orderNo, paidAt: existingRent.paidAt });
    const result = await prisma.auctionResult.findUnique({ where: { projectId: auctionProjectId } });
    if (!result || result.winnerId !== user.id || result.status !== "PUBLISHED") {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: auctionProjectId, endUserId: user.id },
      orderBy: { amount: "desc" },
    });
    if (!topBid) return NextResponse.json({ error: "未找到出价记录" }, { status: 404 });
    const orderNo = mockOrderNo();
    await prisma.$transaction(async (tx) => {
      const dup = await tx.payment.findFirst({
        where: { auctionProjectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
      });
      if (dup) return;
      await tx.payment.create({
        data: {
          orderNo,
          amount: topBid.amount,
          purpose: "AUCTION_RENT",
          status: "SUCCESS",
          endUserId: user.id,
          auctionProjectId,
          paidAt: new Date(),
          channel: "ABC_MOCK",
        },
      });
    });
    const pay = await prisma.payment.findFirst({
      where: { auctionProjectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
    });
    return NextResponse.json({ ok: true, orderNo: pay?.orderNo ?? orderNo, paidAt: pay?.paidAt ?? new Date() });
  }

  if (purpose === "DRYING_DEPOSIT") {
    if (!reservationId) return NextResponse.json({ error: "缺少预约ID" }, { status: 400 });
    const reservation = await prisma.dryingReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.endUserId !== user.id) {
      return NextResponse.json({ error: "预约不存在" }, { status: 403 });
    }
    if (reservation.status !== "APPROVED") {
      return NextResponse.json({ error: "当前状态不可支付" }, { status: 400 });
    }
    const existingDeposit = await prisma.payment.findFirst({
      where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
    });
    if (existingDeposit) return NextResponse.json({ ok: true, orderNo: existingDeposit.orderNo, paidAt: existingDeposit.paidAt });
    const amount = new Decimal(200);
    const orderNo = mockOrderNo();
    await prisma.$transaction(async (tx) => {
      const dup = await tx.payment.findFirst({
        where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
      });
      if (dup) return;
      await tx.payment.create({
        data: {
          orderNo,
          amount,
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
    const pay = await prisma.payment.findFirst({
      where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
    });
    return NextResponse.json({ ok: true, orderNo: pay?.orderNo ?? orderNo, paidAt: pay?.paidAt ?? new Date() });
  }

  // DRYING_RENT
  if (!reservationId) return NextResponse.json({ error: "缺少预约ID" }, { status: 400 });
  const reservation = await prisma.dryingReservation.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.endUserId !== user.id) {
    return NextResponse.json({ error: "预约不存在" }, { status: 403 });
  }
  if (reservation.status !== "ACTIVE") {
    return NextResponse.json({ error: "当前状态不可支付租金" }, { status: 400 });
  }
  const existingRent = await prisma.payment.findFirst({
    where: { reservationId, endUserId: user.id, purpose: "DRYING_RENT", status: "SUCCESS" },
  });
  if (existingRent) return NextResponse.json({ ok: true, orderNo: existingRent.orderNo, paidAt: existingRent.paidAt });
  const amount = new Decimal(500);
  const orderNo = mockOrderNo();
  await prisma.$transaction(async (tx) => {
    const dup = await tx.payment.findFirst({
      where: { reservationId, endUserId: user.id, purpose: "DRYING_RENT", status: "SUCCESS" },
    });
    if (dup) return;
    await tx.payment.create({
      data: {
        orderNo,
        amount,
        purpose: "DRYING_RENT",
        status: "SUCCESS",
        endUserId: user.id,
        reservationId,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
  });
  const pay = await prisma.payment.findFirst({
    where: { reservationId, endUserId: user.id, purpose: "DRYING_RENT", status: "SUCCESS" },
  });
  return NextResponse.json({ ok: true, orderNo: pay?.orderNo ?? orderNo, paidAt: pay?.paidAt ?? new Date() });
}
