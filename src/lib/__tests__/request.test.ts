import { describe, it, expect } from "vitest";
import { parseRequestFields } from "@/lib/request";

describe("parseRequestFields", () => {
  it("parses JSON body", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "o1", name: "资产" }),
    });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ orgId: "o1", name: "资产" });
  });

  it("parses urlencoded form", async () => {
    const body = new URLSearchParams({ type: "LAND", locationText: "A" });
    const req = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ type: "LAND", locationText: "A" });
  });
});
