import { describe, it, expect } from "vitest";
import { requireMultipartForm } from "@/lib/multipart";

describe("requireMultipartForm", () => {
  it("returns 400 for JSON body", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const result = await requireMultipartForm(req);
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("multipart");
  });

  it("returns 400 when body is empty without multipart", async () => {
    const req = new Request("http://localhost/api/upload", { method: "POST" });
    const result = await requireMultipartForm(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(400);
  });
});
