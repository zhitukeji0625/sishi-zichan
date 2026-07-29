import { describe, it, expect, afterEach } from "vitest";
import {
  signThirdPartyToken,
  verifyThirdPartyToken,
  isThirdPartyConfigured,
} from "@/lib/auth/session";

describe("third-party JWT", () => {
  const prevSecret = process.env.THIRD_PARTY_JWT_SECRET;

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.THIRD_PARTY_JWT_SECRET;
    else process.env.THIRD_PARTY_JWT_SECRET = prevSecret;
  });

  it("signs and verifies when THIRD_PARTY_JWT_SECRET is unset (non-production)", async () => {
    delete process.env.THIRD_PARTY_JWT_SECRET;
    expect(isThirdPartyConfigured()).toBe(true);
    const token = await signThirdPartyToken("external_uid", 120);
    expect(await verifyThirdPartyToken(token)).toBe("external_uid");
  });
});
