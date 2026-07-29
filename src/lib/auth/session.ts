import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_ADMIN = "sishi_admin_session";
const SESSION_COOKIE_USER = "sishi_user_session";
const SESSION_DAYS = 7;

/** 生产环境若仅用 HTTP（无 TLS），须设 COOKIE_SECURE=false，否则浏览器不会带上 Cookie */
function cookieSecure() {
  const v = process.env.COOKIE_SECURE;
  if (v === "true") return true;
  if (v === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createDbSession(kind: "admin" | "end_user", userId: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { tokenHash, kind, userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function deleteSessionByToken(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function getSessionUserId(token: string) {
  const row = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!row || row.expiresAt < new Date()) return null;
  return { userId: row.userId, kind: row.kind as "admin" | "end_user" };
}

export async function setSessionCookie(kind: "admin" | "end_user", token: string, expiresAt: Date) {
  const name = kind === "admin" ? SESSION_COOKIE_ADMIN : SESSION_COOKIE_USER;
  (await cookies()).set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(kind: "admin" | "end_user") {
  const name = kind === "admin" ? SESSION_COOKIE_ADMIN : SESSION_COOKIE_USER;
  (await cookies()).set(name, "", { path: "/", maxAge: 0 });
}

export async function getSessionTokenFromCookie(kind: "admin" | "end_user") {
  const name = kind === "admin" ? SESSION_COOKIE_ADMIN : SESSION_COOKIE_USER;
  return (await cookies()).get(name)?.value ?? null;
}

export async function getCurrentAdmin() {
  const token = await getSessionTokenFromCookie("admin");
  if (!token) return null;
  const s = await getSessionUserId(token);
  if (!s || s.kind !== "admin") return null;
  const admin = await prisma.adminUser.findUnique({
    where: { id: s.userId },
    include: { org: true },
  });
  if (!admin || admin.disabled) return null;
  return admin;
}

export async function getCurrentEndUser() {
  const token = await getSessionTokenFromCookie("end_user");
  if (!token) return null;
  const s = await getSessionUserId(token);
  if (!s || s.kind !== "end_user") return null;
  return prisma.endUser.findUnique({
    where: { id: s.userId },
    include: { org: true },
  });
}

const DEV_THIRD_PARTY_JWT_SECRET =
  "dev-only-third-party-jwt-secret-do-not-use-in-production";

function thirdPartySecret() {
  const s = process.env.THIRD_PARTY_JWT_SECRET;
  if (s && s.length >= 16) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode(DEV_THIRD_PARTY_JWT_SECRET);
  }
  throw new Error("THIRD_PARTY_JWT_SECRET must be set (min 16 chars)");
}

/** Third-party handoff: short-lived JWT with external user id */
export async function signThirdPartyToken(externalUserId: string, ttlSec = 300) {
  return new SignJWT({ sub: externalUserId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .sign(thirdPartySecret());
}

export async function verifyThirdPartyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, thirdPartySecret());
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    return sub;
  } catch {
    return null;
  }
}

export function isThirdPartyConfigured() {
  try {
    thirdPartySecret();
    return true;
  } catch {
    return false;
  }
}
