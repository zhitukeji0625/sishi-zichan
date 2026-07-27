import { describe, it, expect } from "vitest";
import { readFormData } from "@/lib/readFormData";

describe("readFormData", () => {
  it("returns null for JSON body", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(await readFormData(req)).toBeNull();
  });

  it("returns null when content-type is missing", async () => {
    const req = new Request("http://localhost/api/upload", { method: "POST", body: "" });
    expect(await readFormData(req)).toBeNull();
  });
});
