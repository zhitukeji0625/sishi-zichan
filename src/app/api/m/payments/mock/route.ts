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

const DRYING_DEPOSIT_AMOUNT = new Decimal(200);
const DRYING_RENT_AMOUNT = new Decimal(500);

export async function POST(req: Request) {
  const user = await getCurrentEndUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const { purpose, auctionProjectId, reservationId } = parsed.data;

  try {
    const pay = await prisma.$transaction(async (tx) => {
      let amount: Decimal;

      if (purpose === "AUCTION_DEPOSIT") {
        if (!auctionProjectId) throw new PayError("缺少项目ID", 400);
        const reg = await tx.auctionRegistration.findUnique({
          where: { projectId_endUserId: { projectId: auctionProjectId, endUserId: user.id } },
        });
        if (!reg) throw new PayError("未报名该项目", 403);
        if (reg.status !== "APPROVED") throw new PayError("报名未通过审核", 400);
        if (reg.depositPaid) throw new PayError("保证金已缴纳", 409);
        const project = await tx.auctionProject.findUnique({ where: { id: auctionProjectId } });
        if (!project) throw new PayError("项目不存在", 404);
        amount = project.depositAmount;
        const orderNo = makeOrderNo();
        const payment = await tx.payment.create({
          data: {
            orderNo,
            amount,
            purpose,
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
        return payment;
      }

      if (purpose === "AUCTION_RENT") {
        if (!auctionProjectId) throw new PayError("缺少项目ID", 400);
        const existingRent = await tx.payment.findFirst({
          where: { auctionProjectId, endUserId: user.id, purpose: "AUCTION_RENT", status: "SUCCESS" },
        });
        if (existingRent) throw new PayError("租金已支付", 409);
        const result = await tx.auctionResult.findUnique({ where: { projectId: auctionProjectId } });
        if (!result || result.winnerId !== user.id) throw new PayError("无权操作", 403);
        const topBid = await tx.auctionBid.findFirst({
          where: { projectId: auctionProjectId, endUserId: user.id },
          orderBy: { amount: "desc" },
        });
        if (!topBid) throw new PayError("未找到出价记录", 404);
        amount = topBid.amount;
        return tx.payment.create({
          data: {
            orderNo: makeOrderNo(),
            amount,
            purpose,
            status: "SUCCESS",
            endUserId: user.id,
            auctionProjectId,
            paidAt: new Date(),
            channel: "ABC_MOCK",
          },
        });
      }

      if (purpose === "DRYING_DEPOSIT") {
        if (!reservationId) throw new PayError("缺少预约ID", 400);
        const reservation = await tx.dryingReservation.findUnique({ where: { id: reservationId } });
        if (!reservation || reservation.endUserId !== user.id) throw new PayError("预约不存在", 403);
        if (reservation.status !== "APPROVED") throw new PayError("当前状态不可支付", 400);
        const existingDeposit = await tx.payment.findFirst({
          where: { reservationId, endUserId: user.id, purpose: "DRYING_DEPOSIT", status: "SUCCESS" },
        });
        if (existingDeposit) throw new PayError("保证金已缴纳", 409);
        const payment = await tx.payment.create({
          data: {
            orderNo: makeOrderNo(),
            amount: DRYING_DEPOSIT_AMOUNT,
            purpose,
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
        return payment;
      }

      if (!reservationId) throw new PayError("缺少预约ID", 400);
      const reservation = await tx.dryingReservation.findUnique({ where: { id: reservationId } });
      if (!reservation || reservation.endUserId !== user.id) throw new PayError("预约不存在", 403);
      if (reservation.status !== "CONTRACT_PENDING" && reservation.status !== "ACTIVE") {
        throw new PayError("当前状态不可支付租金", 400);
      }
      const existingRent = await tx.payment.findFirst({
        where: { reservationId, endUserId: user.id, purpose: "DRYING_RENT", status: "SUCCESS" },
      });
      if (existingRent) throw new PayError("租金已支付", 409);
      return tx.payment.create({
        data: {
          orderNo: makeOrderNo(),
          amount: DRYING_RENT_AMOUNT,
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
  } catch (e) {
    if (e instanceof PayError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

class PayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function makeOrderNo() {
  return `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
}
