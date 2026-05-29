import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createDbSession, setSessionCookie } from "@/lib/auth/session";

const schema = z.object({
  phone: z.string().trim().min(11).max(15),
  password: z.string().min(6).max(64),
  name: z.string().min(1).max(50).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }
  const { phone, password, name } = parsed.data;
  const exists = await prisma.endUser.findUnique({ where: { phone } });
  if (exists) {
    return NextResponse.json({ error: "手机号已注册" }, { status: 409 });
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.endUser.create({
    data: { phone, passwordHash, name: name ?? null },
  });
  const { token, expiresAt } = await createDbSession("end_user", user.id);
  await setSessionCookie("end_user", token, expiresAt);
  return NextResponse.json({ ok: true, userId: user.id });
}
