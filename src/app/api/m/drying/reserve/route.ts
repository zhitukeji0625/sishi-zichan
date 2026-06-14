import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentEndUser } from "@/lib/auth/session";
import { createDryingReservation, parseLocalDate } from "@/lib/drying";
import { notifyUser } from "@/lib/messages";

const schema = z.object({
  listingId: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  const user = await getCurrentEndUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const start = parseLocalDate(parsed.data.startDate);
  const end = parseLocalDate(parsed.data.endDate);
  if (end < start) {
    return NextResponse.json({ error: "结束日期不能早于开始日期" }, { status: 400 });
  }
  const listing = await prisma.dryingFieldListing.findUnique({ where: { id: parsed.data.listingId } });
  if (!listing || listing.status !== "OPERATING") {
    return NextResponse.json({ error: "晒场不存在或未运营" }, { status: 404 });
  }
  try {
    const res = await createDryingReservation({
      listingId: parsed.data.listingId,
      endUserId: user.id,
      start,
      end,
    });
    await notifyUser(user.id, "预约已提交", `申请单号 ${res.orderNo}，请等待审核。`, "RES_SUBMIT");
    return NextResponse.json({ ok: true, orderNo: res.orderNo, id: res.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "预约失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
