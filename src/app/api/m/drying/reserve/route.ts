import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { validateReservationRange, validateBookingDates } from "@/lib/drying";
import { notifyUser } from "@/lib/messages";

const schema = z.object({
  listingId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

export async function POST(req: Request) {
  const user = await getCurrentEndUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (end < start) {
    return NextResponse.json({ error: "结束日期不能早于开始日期" }, { status: 400 });
  }
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
  }
  const listing = await prisma.dryingFieldListing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing || listing.status !== "OPERATING") {
    return NextResponse.json({ error: "晒场不存在或未运营" }, { status: 404 });
  }
  const dateCheck = await validateBookingDates(parsed.data.listingId, start, end);
  if (!dateCheck.ok) {
    return NextResponse.json({ error: dateCheck.message }, { status: 400 });
  }
  const overlap = await prisma.dryingReservation.findFirst({
    where: {
      listingId: parsed.data.listingId,
      endUserId: user.id,
      status: { notIn: ["REJECTED", "CANCELLED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (overlap) {
    return NextResponse.json({ error: "您在该时段已有预约" }, { status: 409 });
  }

  const res = await prisma.$transaction(async (tx) => {
    const check = await validateReservationRange(parsed.data.listingId, start, end);
    if (!check.ok) {
      throw new Error(check.message);
    }
    return tx.dryingReservation.create({
      data: {
        listingId: parsed.data.listingId,
        endUserId: user.id,
        startDate: start,
        endDate: end,
        status: "PENDING_REVIEW",
      },
    });
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "预约失败";
    return { error: message } as const;
  });

  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  await notifyUser(user.id, "预约已提交", `申请单号 ${res.orderNo}，请等待审核。`, "RES_SUBMIT");
  return NextResponse.json({ ok: true, orderNo: res.orderNo, id: res.id });
}
