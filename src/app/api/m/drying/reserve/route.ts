import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentEndUser } from "@/lib/auth/session";
import { createDryingReservation } from "@/lib/drying";
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
  try {
    const res = await createDryingReservation({
      listingId: parsed.data.listingId,
      endUserId: user.id,
      startDate: start,
      endDate: end,
    });
    await notifyUser(user.id, "预约已提交", `申请单号 ${res.orderNo}，请等待审核。`, "RES_SUBMIT");
    return NextResponse.json({ ok: true, orderNo: res.orderNo, id: res.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "预约失败";
    const status = msg.includes("不存在") || msg.includes("未运营") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
