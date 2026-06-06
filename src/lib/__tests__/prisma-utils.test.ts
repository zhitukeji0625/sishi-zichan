import { describe, it, expect } from "vitest";
import { isPrismaUniqueViolation, parseOptionalFormNumber } from "@/lib/prisma-utils";

describe("prisma-utils", () => {
  it("detects P2002 unique constraint errors", () => {
    expect(isPrismaUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isPrismaUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isPrismaUniqueViolation(null)).toBe(false);
  });

  it("parseOptionalFormNumber preserves zero", () => {
    expect(parseOptionalFormNumber("0")).toBe(0);
    expect(parseOptionalFormNumber("")).toBeUndefined();
    expect(parseOptionalFormNumber(undefined)).toBeUndefined();
    expect(parseOptionalFormNumber("100")).toBe(100);
  });
});
