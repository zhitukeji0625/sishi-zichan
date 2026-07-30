import { NextResponse } from "next/server";
import { signThirdPartyToken } from "@/lib/auth/session";

function devThirdPartyTokenAllowed() {
  if (process.env.NODE_ENV !== "production") return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return appUrl.includes("localhost") || appUrl.includes("127.0.0.1");
}

export async function GET(req: Request) {
  if (!devThirdPartyTokenAllowed()) {
    return NextResponse.json({ error: "不可用" }, { status: 404 });
  }
  const url = new URL(req.url);
  const uid = url.searchParams.get("u_id") ?? `demo_${Date.now()}`;
  const token = await signThirdPartyToken(uid, 600);
  return NextResponse.json({ token, u_id: uid, hint: "POST /api/auth/third-party with { token }" });
}
