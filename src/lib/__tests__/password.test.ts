import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password", () => {
  it("哈希后可验证明文", async () => {
    const hash = await hashPassword("admin123");
    expect(hash).not.toBe("admin123");
    expect(await verifyPassword("admin123", hash)).toBe(true);
  });

  it("错误密码校验失败", async () => {
    const hash = await hashPassword("secret");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
