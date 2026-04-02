import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  deleteSessionByToken,
  getSessionTokenFromCookie,
} from "@/lib/auth/session";

export async function POST() {
  const token = await getSessionTokenFromCookie("admin");
  if (token) await deleteSessionByToken(token);
  await clearSessionCookie("admin");
  return NextResponse.json({ ok: true });
}
