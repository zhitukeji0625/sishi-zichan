import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createDbSession, setSessionCookie } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!phone || !password) {
    return NextResponse.json({ error: "手机号与密码必填" }, { status: 400 });
  }
  const user = await prisma.endUser.findUnique({ where: { phone } });
  if (!user?.passwordHash) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  const { token, expiresAt } = await createDbSession("end_user", user.id);
  await setSessionCookie("end_user", token, expiresAt);
  return NextResponse.json({ ok: true });
}
