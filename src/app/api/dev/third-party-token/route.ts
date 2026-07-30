import { NextResponse } from "next/server";
import { isThirdPartyConfigured, signThirdPartyToken } from "@/lib/auth/session";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "不可用" }, { status: 404 });
  }
  if (!isThirdPartyConfigured()) {
    return NextResponse.json({ error: "第三方登录未配置" }, { status: 503 });
  }
  const url = new URL(req.url);
  const uid = url.searchParams.get("u_id") ?? `demo_${Date.now()}`;
  const token = await signThirdPartyToken(uid, 600);
  return NextResponse.json({ token, u_id: uid, hint: "POST /api/auth/third-party with { token }" });
}
