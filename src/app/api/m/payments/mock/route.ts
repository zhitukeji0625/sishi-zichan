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
    const project = await prisma.auctionProject.findUnique({ where: { id: auctionProjectId } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    if (project.status !== "SCHEDULED" && project.status !== "LIVE") {
      return NextResponse.json({ error: "项目状态不允许缴纳保证金" }, { status: 400 });
    }
    const reg = await prisma.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
    });
    if (!reg || reg.status !== "APPROVED") {
      return NextResponse.json({ error: "报名未通过审核" }, { status: 403 });
    }
    if (reg.depositPaid) {
      return NextResponse.json({ ok: true, message: "保证金已缴纳" });
    }
    const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const pay = await prisma.$transaction(async (tx) => {
      const fresh = await tx.auctionRegistration.findUnique({
        where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
      });
      if (fresh?.depositPaid) return null;
      const created = await tx.payment.create({
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
      return created;
    });
    if (!pay) return NextResponse.json({ ok: true, message: "保证金已缴纳" });
    return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
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
      where: { projectId: auctionProjectId },
      orderBy: { amount: "desc" },
    });
    if (!topBid) return NextResponse.json({ error: "未找到出价记录" }, { status: 404 });
    const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const pay = await prisma.$transaction(async (tx) => {
      const dup = await tx.payment.findFirst({
        where: { auctionProjectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
      });
      if (dup) return dup;
      return tx.payment.create({
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
    return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
  }

  if (purpose === "DRYING_DEPOSIT") {
    if (!reservationId) return NextResponse.json({ error: "缺少预约ID" }, { status: 400 });
    const reservation = await prisma.dryingReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.endUserId !== user.id) {
      return NextResponse.json({ error: "预约不存在" }, { status: 403 });
    }
    const existingDeposit = await prisma.payment.findFirst({
      where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
    });
    if (existingDeposit) {
      return NextResponse.json({ ok: true, orderNo: existingDeposit.orderNo, paidAt: existingDeposit.paidAt });
    }
    if (reservation.status !== "APPROVED") {
      return NextResponse.json({ error: "当前状态不可支付" }, { status: 400 });
    }
    const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const pay = await prisma.$transaction(async (tx) => {
      const dup = await tx.payment.findFirst({
        where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
      });
      if (dup) return dup;
      const created = await tx.payment.create({
        data: {
          orderNo,
          amount: new Decimal(200),
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
      return created;
    });
    return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
  }

  // DRYING_RENT
  if (!reservationId) return NextResponse.json({ error: "缺少预约ID" }, { status: 400 });
  const reservation = await prisma.dryingReservation.findUnique({ where: { id: reservationId } });
  if (!reservation || reservation.endUserId !== user.id) {
    return NextResponse.json({ error: "预约不存在" }, { status: 403 });
  }
  if (reservation.status !== "ACTIVE" && reservation.status !== "PAID") {
    return NextResponse.json({ error: "当前状态不可支付租金" }, { status: 400 });
  }
  const existingRent = await prisma.payment.findFirst({
    where: { reservationId, endUserId: user.id, purpose: "DRYING_RENT", status: "SUCCESS" },
  });
  if (existingRent) {
    return NextResponse.json({ ok: true, orderNo: existingRent.orderNo, paidAt: existingRent.paidAt });
  }
  const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const pay = await prisma.$transaction(async (tx) => {
    const dup = await tx.payment.findFirst({
      where: { reservationId, endUserId: user.id, purpose: "DRYING_RENT", status: "SUCCESS" },
    });
    if (dup) return dup;
    return tx.payment.create({
      data: {
        orderNo,
        amount: new Decimal(500),
        purpose: "DRYING_RENT",
        status: "SUCCESS",
        endUserId: user.id,
        reservationId,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
  });
  return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
}
