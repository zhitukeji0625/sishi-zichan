import { NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { getCurrentEndUser } from "@/lib/auth/session";
import { placeBid } from "@/lib/auction";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentEndUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { projectId } = await params;
  const body = await req.json().catch(() => null);
  const raw = body?.amount;
  const amountStr =
    typeof raw === "number"
      ? raw.toFixed(2)
      : typeof raw === "string"
        ? raw.trim()
        : "";
  if (!/^\d+(\.\d{1,2})?$/.test(amountStr) || Number(amountStr) <= 0) {
    return NextResponse.json({ error: "出价金额无效" }, { status: 400 });
  }
  try {
    const bid = await placeBid({
      projectId,
      endUserId: user.id,
      amount: new Decimal(amountStr),
    });
    return NextResponse.json({ ok: true, bidId: bid.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "出价失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
