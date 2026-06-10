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

  let amount: Decimal;

  if (purpose === "AUCTION_DEPOSIT") {
    if (!auctionProjectId) return NextResponse.json({ error: "缺少项目ID" }, { status: 400 });
    const reg = await prisma.auctionRegistration.findUnique({
      where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
    });
    if (!reg) return NextResponse.json({ error: "未报名该项目" }, { status: 403 });
    if (reg.depositPaid) return NextResponse.json({ error: "保证金已缴纳" }, { status: 409 });
    const project = await prisma.auctionProject.findUnique({ where: { id: auctionProjectId } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    amount = project.depositAmount;
  } else if (purpose === "AUCTION_RENT") {
    if (!auctionProjectId) return NextResponse.json({ error: "缺少项目ID" }, { status: 400 });
    const existingRent = await prisma.payment.findFirst({
      where: { auctionProjectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
    });
    if (existingRent) return NextResponse.json({ error: "租金已支付" }, { status: 409 });
    const result = await prisma.auctionResult.findUnique({ where: { projectId: auctionProjectId } });
    if (!result || result.winnerId !== user.id) return NextResponse.json({ error: "无权操作" }, { status: 403 });
    const topBid = await prisma.auctionBid.findFirst({
      where: { projectId: auctionProjectId, endUserId: user.id },
      orderBy: { amount: "desc" },
    });
    if (!topBid) return NextResponse.json({ error: "未找到出价记录" }, { status: 404 });
    amount = topBid.amount;
  } else if (purpose === "DRYING_DEPOSIT") {
    if (!reservationId) return NextResponse.json({ error: "缺少预约ID" }, { status: 400 });
    const reservation = await prisma.dryingReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.endUserId !== user.id) return NextResponse.json({ error: "预约不存在" }, { status: 403 });
    if (reservation.status !== "APPROVED") return NextResponse.json({ error: "当前状态不可支付" }, { status: 400 });
    const existingDeposit = await prisma.payment.findFirst({
      where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
    });
    if (existingDeposit) return NextResponse.json({ error: "保证金已缴纳" }, { status: 409 });
    amount = new Decimal(200);
  } else {
    if (!reservationId) return NextResponse.json({ error: "缺少预约ID" }, { status: 400 });
    const reservation = await prisma.dryingReservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.endUserId !== user.id) return NextResponse.json({ error: "预约不存在" }, { status: 403 });
    amount = new Decimal(500);
  }

  const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const pay = await prisma.$transaction(async (tx) => {
    if (purpose === "AUCTION_DEPOSIT" && auctionProjectId) {
      const updated = await tx.auctionRegistration.updateMany({
        where: {
          projectId: auctionProjectId,
          endUserId: user.id,
          depositPaid: false,
        },
        data: { depositPaid: true },
      });
      if (updated.count === 0) {
        throw new Error("DEPOSIT_ALREADY_PAID");
      }
    }
    if (purpose === "DRYING_DEPOSIT" && reservationId) {
      const updated = await tx.dryingReservation.updateMany({
        where: {
          id: reservationId,
          endUserId: user.id,
          status: "APPROVED",
        },
        data: { status: "CONTRACT_PENDING" },
      });
      if (updated.count === 0) {
        throw new Error("INVALID_RESERVATION_STATE");
      }
    }
    return tx.payment.create({
      data: {
        orderNo,
        amount,
        purpose,
        status: "SUCCESS",
        endUserId: user.id,
        auctionProjectId: auctionProjectId ?? null,
        reservationId: reservationId ?? null,
        paidAt: new Date(),
        channel: "ABC_MOCK",
      },
    });
  }).catch((err: Error) => {
    if (err.message === "DEPOSIT_ALREADY_PAID") return null;
    if (err.message === "INVALID_RESERVATION_STATE") return null;
    throw err;
  });
  if (!pay) {
    return NextResponse.json({ error: "支付状态已变更，请刷新后重试" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
}
