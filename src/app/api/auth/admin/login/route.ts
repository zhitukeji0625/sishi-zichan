import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createDbSession, setSessionCookie } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!phone || !password) {
    return NextResponse.json({ error: "手机号与密码必填" }, { status: 400 });
  }
  const admin = await prisma.adminUser.findUnique({ where: { phone } });
  if (!admin || admin.disabled) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }
  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });
  }
  const { token, expiresAt } = await createDbSession("admin", admin.id);
  await setSessionCookie("admin", token, expiresAt);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await writeAudit(admin.id, "ADMIN_LOGIN", JSON.stringify({ phone }), ip ?? undefined);
  return NextResponse.json({ ok: true, name: admin.name, role: admin.role });
}
