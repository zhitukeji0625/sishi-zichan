import { describe, it, expect } from "vitest";
import { parseRequestFields } from "@/lib/request";

describe("parseRequestFields", () => {
  it("parses JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "测试", refPriceMin: 100 }),
    });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ name: "测试", refPriceMin: "100" });
  });

  it("parses multipart form body", async () => {
    const fd = new FormData();
    fd.set("name", "资产A");
    fd.set("type", "LAND");
    const req = new Request("http://localhost", { method: "POST", body: fd });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ name: "资产A", type: "LAND" });
  });
});
