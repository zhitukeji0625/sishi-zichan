import { SignJWT, jwtVerify } from "jose";

function thirdPartySecret() {
  const s = process.env.THIRD_PARTY_JWT_SECRET;
  if (!s || s.length < 16) throw new Error("THIRD_PARTY_JWT_SECRET must be set (min 16 chars)");
  return new TextEncoder().encode(s);
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
