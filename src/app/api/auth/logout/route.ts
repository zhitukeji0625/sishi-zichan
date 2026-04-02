import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  deleteSessionByToken,
  getSessionTokenFromCookie,
} from "@/lib/auth/session";

export async function POST() {
  const token = await getSessionTokenFromCookie("end_user");
  if (token) await deleteSessionByToken(token);
  await clearSessionCookie("end_user");
  return NextResponse.json({ ok: true });
}
