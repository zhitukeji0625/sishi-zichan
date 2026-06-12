import { NextResponse } from "next/server";
import { z } from "zod";
import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { validateReservationRange } from "@/lib/drying";
import { notifyUser } from "@/lib/messages";
import { parseLocalDateString } from "@/lib/dates";

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
  const start = parseLocalDateString(parsed.data.startDate);
  const end = parseLocalDateString(parsed.data.endDate);
  if (!start || !end) {
    return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
  }
  if (end < start) {
    return NextResponse.json({ error: "结束日期不能早于开始日期" }, { status: 400 });
  }
  const listing = await prisma.dryingFieldListing.findUnique({
    where: { id: parsed.data.listingId },
    include: { bookingRules: true },
  });
  if (!listing || listing.status !== "OPERATING") {
    return NextResponse.json({ error: "晒场不存在或未运营" }, { status: 404 });
  }
  const today = startOfDay(new Date());
  if (start < today) {
    return NextResponse.json({ error: "开始日期不能早于今天" }, { status: 400 });
  }
  const maxAdvance = listing.bookingRules[0]?.maxAdvanceDays ?? 7;
  const latest = addDays(today, maxAdvance);
  if (end > latest) {
    return NextResponse.json({ error: `最多可提前 ${maxAdvance} 天预约` }, { status: 400 });
  }
  const check = await validateReservationRange(parsed.data.listingId, start, end);
  if (!check.ok) {
    return NextResponse.json({ error: check.message }, { status: 400 });
  }
  const res = await prisma.dryingReservation.create({
    data: {
      listingId: parsed.data.listingId,
      endUserId: user.id,
      startDate: start,
      endDate: end,
      status: "PENDING_REVIEW",
    },
  });
  await notifyUser(user.id, "预约已提交", `申请单号 ${res.orderNo}，请等待审核。`, "RES_SUBMIT");
  return NextResponse.json({ ok: true, orderNo: res.orderNo, id: res.id });
}
