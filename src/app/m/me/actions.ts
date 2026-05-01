"use server";

import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  deleteSessionByToken,
  getSessionTokenFromCookie,
} from "@/lib/auth/session";

export async function endUserLogoutAction() {
  const token = await getSessionTokenFromCookie("end_user");
  if (token) await deleteSessionByToken(token);
  await clearSessionCookie("end_user");
  redirect("/m/login");
}
