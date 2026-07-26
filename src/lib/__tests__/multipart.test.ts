import { describe, it, expect } from "vitest";
import { readMultipartForm } from "@/lib/multipart";

describe("readMultipartForm", () => {
  it("rejects non-multipart content type", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await readMultipartForm(req);
    expect(result).toEqual({ error: "请使用 multipart/form-data 上传" });
  });

  it("accepts multipart/form-data", async () => {
    const body = new FormData();
    body.append("file", new Blob(["x"], { type: "image/png" }), "a.png");
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body,
    });
    const result = await readMultipartForm(req);
    expect(result).toBeInstanceOf(FormData);
  });
});
