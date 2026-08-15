import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { parseRequestFormData } from "@/lib/form-data";

describe("parseRequestFormData", () => {
  it("rejects JSON content type", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await parseRequestFormData(req);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it("accepts multipart form data", async () => {
    const fd = new FormData();
    fd.set("file", new File(["x"], "a.txt", { type: "text/plain" }));
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: fd,
    });
    const result = await parseRequestFormData(req);
    expect(result).toBeInstanceOf(FormData);
    expect((result as FormData).get("file")).toBeTruthy();
  });
});
