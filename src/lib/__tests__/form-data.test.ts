import { describe, it, expect } from "vitest";
import { parseMultipartFormData } from "@/lib/http/form-data";

describe("parseMultipartFormData", () => {
  it("returns null for JSON body", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(await parseMultipartFormData(req)).toBeNull();
  });

  it("parses multipart body", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["x"], { type: "image/png" }), "a.png");
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: fd,
    });
    const parsed = await parseMultipartFormData(req);
    expect(parsed).not.toBeNull();
    expect(parsed!.get("file")).toBeTruthy();
  });
});
