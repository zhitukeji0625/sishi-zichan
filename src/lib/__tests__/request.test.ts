import { describe, it, expect } from "vitest";
import { parseRequestFields } from "@/lib/request";

function req(body: BodyInit | null, contentType?: string): Request {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  return new Request("http://test", { method: "POST", body, headers });
}

describe("parseRequestFields", () => {
  it("parses application/json", async () => {
    const raw = await parseRequestFields(
      req(JSON.stringify({ name: "a", count: 3 }), "application/json"),
    );
    expect(raw).toEqual({ name: "a", count: "3" });
  });

  it("parses multipart form fields", async () => {
    const fd = new FormData();
    fd.set("orgId", "o1");
    fd.set("name", "资产");
    const raw = await parseRequestFields(req(fd));
    expect(raw).toEqual({ orgId: "o1", name: "资产" });
  });

  it("returns empty object for invalid json body", async () => {
    const raw = await parseRequestFields(req("not-json", "application/json"));
    expect(raw).toEqual({});
  });

  it("does not throw on unsupported content type", async () => {
    const raw = await parseRequestFields(
      req("plain", "text/plain"),
    );
    expect(raw).toEqual({});
  });
});
