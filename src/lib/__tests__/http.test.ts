import { describe, it, expect } from "vitest";
import { readMultipartForm } from "@/lib/http";

describe("readMultipartForm", () => {
  it("rejects non-multipart content type", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = await readMultipartForm(req);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("multipart");
  });
});
