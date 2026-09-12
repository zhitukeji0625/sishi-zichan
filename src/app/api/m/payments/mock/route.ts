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
    try {
      const pay = await prisma.$transaction(async (tx) => {
        const reg = await tx.auctionRegistration.findUnique({
          where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
        });
        if (!reg) throw new Error("FORBIDDEN:未报名该项目");
        if (reg.depositPaid) throw new Error("CONFLICT:保证金已缴纳");
        const project = await tx.auctionProject.findUnique({ where: { id: auctionProjectId } });
        if (!project) throw new Error("NOT_FOUND:项目不存在");
        const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const payment = await tx.payment.create({
          data: {
            orderNo,
            amount: project.depositAmount,
            purpose,
            status: "SUCCESS",
            endUserId: user.id,
            auctionProjectId,
            paidAt: new Date(),
            channel: "ABC_MOCK",
          },
        });
        await tx.auctionRegistration.updateMany({
          where: { projectId: auctionProjectId, endUserId: user.id },
          data: { depositPaid: true },
        });
        return payment;
      });
      return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
    } catch (e) {
      return mapPaymentError(e);
    }
  }

  if (purpose === "AUCTION_RENT") {
    if (!auctionProjectId) return NextResponse.json({ error: "缺少项目ID" }, { status: 400 });
    const existingRent = await prisma.payment.findFirst({
      where: { auctionProjectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
    });
    if (existingRent) return NextResponse.json({ error: "租金已支付" }, { status: 409 });
    const result = await prisma.auctionResult.findUnique({ where: { projectId: auctionProjectId } });
    if (!result || result.winnerId !== user.id) {
      return NextResponse.json({ error: "无权操作" }, { status: 403 });
    }
    const signedContract = await prisma.contract.findFirst({
      where: {
        auctionProjectId,
        endUserId: user.id,
        status: "SIGNED",
      },
    });
    if (!signedContract) {
      return NextResponse.json({ error: "请先签署合同" }, { status: 400 });
    }
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: auctionProjectId, endUserId: user.id },
      orderBy: { amount: "desc" },
    });
    if (!topBid) return NextResponse.json({ error: "未找到出价记录" }, { status: 404 });
    const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const pay = await prisma.payment.create({
      data: {
        orderNo,
        amount: topBid.amount,
        purpose,
        status: "SUCCESS",
        endUserId: user.id,
        auctionProjectId,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
    return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
  }

  if (purpose === "DRYING_DEPOSIT") {
    if (!reservationId) return NextResponse.json({ error: "缺少预约ID" }, { status: 400 });
    try {
      const pay = await prisma.$transaction(async (tx) => {
        const reservation = await tx.dryingReservation.findUnique({ where: { id: reservationId } });
        if (!reservation || reservation.endUserId !== user.id) {
          throw new Error("FORBIDDEN:预约不存在");
        }
        if (reservation.status !== "APPROVED") {
          throw new Error("BAD:当前状态不可支付");
        }
        const existingDeposit = await tx.payment.findFirst({
          where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
        });
        if (existingDeposit) throw new Error("CONFLICT:保证金已缴纳");
        const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const payment = await tx.payment.create({
          data: {
            orderNo,
            amount: new Decimal(200),
            purpose,
            status: "SUCCESS",
            endUserId: user.id,
            reservationId,
            paidAt: new Date(),
            channel: "ABC_MOCK",
          },
        });
        await tx.dryingReservation.updateMany({
          where: { id: reservationId, endUserId: user.id },
          data: { status: "CONTRACT_PENDING" },
        });
        return payment;
      });
      return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
    } catch (e) {
      return mapPaymentError(e);
    }
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
  const signedContract = await prisma.contract.findFirst({
    where: { reservationId, endUserId: user.id, status: "SIGNED" },
  });
  if (!signedContract) {
    return NextResponse.json({ error: "请先签署合同" }, { status: 400 });
  }
  const existingRent = await prisma.payment.findFirst({
    where: { reservationId, endUserId: user.id, purpose: "DRYING_RENT", status: "SUCCESS" },
  });
  if (existingRent) return NextResponse.json({ error: "租金已支付" }, { status: 409 });
  const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const pay = await prisma.payment.create({
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
  return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
}

function mapPaymentError(e: unknown) {
  const msg = e instanceof Error ? e.message : "";
  if (msg.startsWith("FORBIDDEN:")) {
    return NextResponse.json({ error: msg.slice("FORBIDDEN:".length) }, { status: 403 });
  }
  if (msg.startsWith("NOT_FOUND:")) {
    return NextResponse.json({ error: msg.slice("NOT_FOUND:".length) }, { status: 404 });
  }
  if (msg.startsWith("CONFLICT:")) {
    return NextResponse.json({ error: msg.slice("CONFLICT:".length) }, { status: 409 });
  }
  if (msg.startsWith("BAD:")) {
    return NextResponse.json({ error: msg.slice("BAD:".length) }, { status: 400 });
  }
  throw e;
}
