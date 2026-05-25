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
  let amountDec: Decimal;
  try {
    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) throw new Error("empty");
      amountDec = new Decimal(s);
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      amountDec = new Decimal(raw);
    } else {
      throw new Error("invalid type");
    }
  } catch {
    return NextResponse.json({ error: "出价金额无效" }, { status: 400 });
  }
  if (amountDec.lte(0)) {
    return NextResponse.json({ error: "出价金额无效" }, { status: 400 });
  }
  try {
    const bid = await placeBid({
      projectId,
      endUserId: user.id,
      amount: amountDec,
    });
    return NextResponse.json({ ok: true, bidId: bid.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "出价失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
