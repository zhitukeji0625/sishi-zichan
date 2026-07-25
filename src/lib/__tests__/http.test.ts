import { describe, expect, it } from "vitest";
import { isFormContentType, readMultipartForm } from "@/lib/http";

describe("http helpers", () => {
  it("isFormContentType detects multipart", () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    });
    expect(isFormContentType(req)).toBe(true);
  });

  it("readMultipartForm rejects non-multipart", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const result = await readMultipartForm(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });
});
