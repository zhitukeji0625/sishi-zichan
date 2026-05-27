import { describe, it, expect } from "vitest";
import { roleLabel, isRegimentOrAbove, isDivision } from "@/lib/rbac";

describe("roleLabel", () => {
  it("maps known roles to Chinese labels", () => {
    expect(roleLabel("DIVISION_ADMIN")).toBe("师级管理员");
    expect(roleLabel("REGIMENT_ADMIN")).toBe("团级管理员");
    expect(roleLabel("COMPANY_ADMIN")).toBe("连队管理员");
  });
});

describe("isRegimentOrAbove", () => {
  it("returns true for division and regiment only", () => {
    expect(isRegimentOrAbove("DIVISION_ADMIN")).toBe(true);
    expect(isRegimentOrAbove("REGIMENT_ADMIN")).toBe(true);
    expect(isRegimentOrAbove("COMPANY_ADMIN")).toBe(false);
  });
});

describe("isDivision", () => {
  it("returns true only for division admin", () => {
    expect(isDivision("DIVISION_ADMIN")).toBe(true);
    expect(isDivision("REGIMENT_ADMIN")).toBe(false);
    expect(isDivision("COMPANY_ADMIN")).toBe(false);
  });
});
