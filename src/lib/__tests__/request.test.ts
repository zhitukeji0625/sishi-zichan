import { describe, it, expect } from "vitest";
import { parseRequestFields } from "@/lib/request";

describe("parseRequestFields", () => {
  it("parses JSON body", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: "o1", name: "资产" }),
    });
    const fields = await parseRequestFields(req);
    expect(fields).toEqual({ orgId: "o1", name: "资产" });
  });

  it("parses multipart form fields", async () => {
    const fd = new FormData();
    fd.set("orgId", "o1");
    fd.set("name", "资产");
    const req = new Request("http://localhost/api", { method: "POST", body: fd });
    const fields = await parseRequestFields(req);
    expect(fields.orgId).toBe("o1");
    expect(fields.name).toBe("资产");
  });

  it("parses JSON when Content-Type is wrong", async () => {
    const req = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ type: "LAND" }),
    });
    const fields = await parseRequestFields(req);
    expect(fields.type).toBe("LAND");
  });
});
