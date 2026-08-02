import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  try {
    const user = await upsertEndUserFromExternal(externalUserId);
    if (!user) {
      return NextResponse.json({ error: "用户创建失败" }, { status: 500 });
    }
    const { token: sessionToken, expiresAt } = await createDbSession("end_user", user.id);
    await setSessionCookie("end_user", sessionToken, expiresAt);
    return NextResponse.json({ ok: true, userId: user.id, name: user.name });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "用户信息冲突，请联系管理员" }, { status: 409 });
    }
    throw e;
  }
}
