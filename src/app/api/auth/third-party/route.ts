import { NextResponse } from "next/server";
import { verifyThirdPartyToken } from "@/lib/auth/session";
import { upsertEndUserFromExternal } from "@/lib/external-user";
import { createDbSession, setSessionCookie } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "缺少 token" }, { status: 400 });
  }
  const externalUserId = await verifyThirdPartyToken(token);
  if (!externalUserId) {
    return NextResponse.json({ error: "票据无效或已过期" }, { status: 401 });
  }
  let user;
  try {
    user = await upsertEndUserFromExternal(externalUserId);
  } catch {
    return NextResponse.json({ error: "用户同步失败，请稍后重试" }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "用户创建失败" }, { status: 500 });
  }
  const { token: sessionToken, expiresAt } = await createDbSession("end_user", user.id);
  await setSessionCookie("end_user", sessionToken, expiresAt);
  return NextResponse.json({ ok: true, userId: user.id, name: user.name });
}
