import { describe, it, expect } from "vitest";
import { isDivision, isRegimentOrAbove, roleLabel } from "@/lib/rbac";

describe("rbac helpers", () => {
  it("roleLabel maps known roles", () => {
    expect(roleLabel("DIVISION_ADMIN")).toBe("师级管理员");
    expect(roleLabel("REGIMENT_ADMIN")).toBe("团级管理员");
    expect(roleLabel("COMPANY_ADMIN")).toBe("连队管理员");
  });

  it("isRegimentOrAbove", () => {
    expect(isRegimentOrAbove("DIVISION_ADMIN")).toBe(true);
    expect(isRegimentOrAbove("REGIMENT_ADMIN")).toBe(true);
    expect(isRegimentOrAbove("COMPANY_ADMIN")).toBe(false);
  });

  it("isDivision", () => {
    expect(isDivision("DIVISION_ADMIN")).toBe(true);
    expect(isDivision("REGIMENT_ADMIN")).toBe(false);
  });
});
