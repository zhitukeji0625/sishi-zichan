import { describe, it, expect } from "vitest";
import { readMultipartForm } from "@/lib/multipart";

describe("readMultipartForm", () => {
  it("returns 400 when Content-Type is not multipart", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: 1 }),
    });
    const result = await readMultipartForm(req);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/multipart/);
  });

  it("returns 400 when multipart body has no boundary", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data" },
      body: "not-really-multipart",
    });
    const result = await readMultipartForm(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });
});
