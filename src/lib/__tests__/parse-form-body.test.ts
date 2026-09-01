import { describe, it, expect } from "vitest";
import { parseFormBody } from "@/lib/parse-form-body";

describe("parseFormBody", () => {
  it("returns null for JSON content type", async () => {
    const req = new Request("http://localhost/api/admin/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "test" }),
    });
    expect(await parseFormBody(req)).toBeNull();
  });

  it("parses urlencoded form bodies", async () => {
    const req = new Request("http://localhost/api/admin/assets", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=测试&locationText=地点",
    });
    const raw = await parseFormBody(req);
    expect(raw).toEqual({ name: "测试", locationText: "地点" });
  });
});
