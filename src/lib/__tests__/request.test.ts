import { describe, it, expect } from "vitest";
import { parseRequestFields } from "@/lib/request";

describe("parseRequestFields", () => {
  it("parses JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "o1", name: "测试" }),
    });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ orgId: "o1", name: "测试" });
  });

  it("parses JSON without requiring multipart formData", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ a: "1" }),
    });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ a: "1" });
  });

  it("parses urlencoded body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "x=1&y=2",
    });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ x: "1", y: "2" });
  });
});
