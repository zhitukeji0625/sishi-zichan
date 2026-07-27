import { describe, it, expect } from "vitest";
import { readFormData } from "@/lib/read-form-data";

describe("readFormData", () => {
  it("rejects non-multipart body with 400", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await readFormData(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const json = await result.response.json();
      expect(json.error).toMatch(/multipart/i);
    }
  });
});
