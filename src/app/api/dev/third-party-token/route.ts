import { NextResponse } from "next/server";
import { signThirdPartyToken } from "@/lib/auth/session";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "不可用" }, { status: 404 });
  }
  const url = new URL(req.url);
  const uid = url.searchParams.get("u_id") ?? `demo_${Date.now()}`;
  try {
    const token = await signThirdPartyToken(uid, 600);
    return NextResponse.json({
      token,
      u_id: uid,
      hint: "POST /api/auth/third-party with { token }",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "签发失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
