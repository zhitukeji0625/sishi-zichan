import { NextResponse } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";

const schema = z.object({
  purpose: z.enum(["AUCTION_DEPOSIT", "AUCTION_RENT", "DRYING_DEPOSIT", "DRYING_RENT"]),
  amount: z.number().positive(),
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
  const { purpose, amount, auctionProjectId, reservationId } = parsed.data;
  if (purpose === "AUCTION_DEPOSIT" && auctionProjectId) {
    const existing = await prisma.payment.findFirst({
      where: {
        auctionProjectId,
        endUserId: user.id,
        purpose: "AUCTION_DEPOSIT",
        status: "SUCCESS",
      },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        orderNo: existing.orderNo,
        paidAt: existing.paidAt,
        idempotent: true,
      });
    }
  }
  if (purpose === "DRYING_DEPOSIT" && reservationId) {
    const existing = await prisma.payment.findFirst({
      where: {
        reservationId,
        endUserId: user.id,
        purpose: "DRYING_DEPOSIT",
        status: "SUCCESS",
      },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        orderNo: existing.orderNo,
        paidAt: existing.paidAt,
        idempotent: true,
      });
    }
  }
  const orderNo = `MOCK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const pay = await prisma.payment.create({
    data: {
      orderNo,
      amount: new Decimal(amount),
      purpose,
      status: "SUCCESS",
      endUserId: user.id,
      auctionProjectId: auctionProjectId ?? null,
      reservationId: reservationId ?? null,
      paidAt: new Date(),
      channel: "ABC_MOCK",
    },
  });
  if (auctionProjectId && purpose === "AUCTION_DEPOSIT") {
    await prisma.auctionRegistration.updateMany({
      where: { projectId: auctionProjectId, endUserId: user.id },
      data: { depositPaid: true },
    });
  }
  if (reservationId && purpose === "DRYING_DEPOSIT") {
    await prisma.dryingReservation.updateMany({
      where: { id: reservationId, endUserId: user.id },
      data: { status: "CONTRACT_PENDING" },
    });
  }
  return NextResponse.json({ ok: true, orderNo: pay.orderNo, paidAt: pay.paidAt });
}
