import { NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { getCurrentEndUser } from "@/lib/auth/session";
import { placeBid } from "@/lib/auction";
import { refreshAuctionProjectStatuses } from "@/lib/cron";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const user = await getCurrentEndUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { projectId } = await params;
  await refreshAuctionProjectStatuses();
  const body = await req.json().catch(() => null);
  const raw = body?.amount;
  const amount = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "出价金额无效" }, { status: 400 });
  }
  try {
    const bid = await placeBid({
      projectId,
      endUserId: user.id,
      amount: new Decimal(amount),
    });
    return NextResponse.json({ ok: true, bidId: bid.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "出价失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
