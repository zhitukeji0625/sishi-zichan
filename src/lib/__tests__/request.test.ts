import { describe, it, expect } from "vitest";
import { parseRequestFields } from "@/lib/request";

function req(body: BodyInit | null, contentType: string) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: contentType ? { "content-type": contentType } : {},
    body,
  });
}

describe("parseRequestFields", () => {
  it("parses application/json", async () => {
    const fields = await parseRequestFields(
      req(JSON.stringify({ name: "资产", orgId: "abc", count: 3 }), "application/json"),
    );
    expect(fields).toEqual({ name: "资产", orgId: "abc", count: "3" });
  });

  it("parses multipart/form-data", async () => {
    const fd = new FormData();
    fd.set("name", "测试");
    fd.set("type", "LAND");
    const fields = await parseRequestFields(req(fd, ""));
    expect(fields.name).toBe("测试");
    expect(fields.type).toBe("LAND");
  });
});
