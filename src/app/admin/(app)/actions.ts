"use server";

import { redirect } from "next/navigation";
import {
  clearSessionCookie,
  deleteSessionByToken,
  getSessionTokenFromCookie,
} from "@/lib/auth/session";

export async function adminLogoutAction() {
  const token = await getSessionTokenFromCookie("admin");
  if (token) await deleteSessionByToken(token);
  await clearSessionCookie("admin");
  redirect("/admin/login");
}
