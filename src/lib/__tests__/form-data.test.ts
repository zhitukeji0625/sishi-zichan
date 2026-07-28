import { describe, it, expect } from "vitest";
import { readFormData } from "@/lib/form-data";

describe("readFormData", () => {
  it("rejects application/json without throwing", async () => {
    const req = new Request("http://localhost/api/admin/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    const result = await readFormData(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("multipart");
  });

  it("accepts multipart form data", async () => {
    const fd = new FormData();
    fd.set("name", "测试");
    const req = new Request("http://localhost/api/admin/assets", {
      method: "POST",
      body: fd,
    });
    const result = await readFormData(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.formData.get("name")).toBe("测试");
  });
});
