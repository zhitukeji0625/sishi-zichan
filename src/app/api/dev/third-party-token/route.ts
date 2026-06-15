import { NextResponse } from "next/server";
import { signThirdPartyToken } from "@/lib/auth/session";

export async function GET(req: Request) {
  const devAllowed =
    process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_ROUTES === "true";
  if (!devAllowed) {
    return NextResponse.json({ error: "不可用" }, { status: 404 });
  }
  const url = new URL(req.url);
  const uid = url.searchParams.get("u_id") ?? `demo_${Date.now()}`;
  const token = await signThirdPartyToken(uid, 600);
  return NextResponse.json({ token, u_id: uid, hint: "POST /api/auth/third-party with { token }" });
}
