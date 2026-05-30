import { describe, it, expect } from "vitest";
import { escapeHtml, fillContractTemplate } from "@/lib/html";

describe("escapeHtml", () => {
  it("escapes quotes and angle brackets", () => {
    expect(escapeHtml(`a"b<'>`)).toBe("a&quot;b&lt;&#39;&gt;");
  });
});

describe("fillContractTemplate", () => {
  it("replaces all placeholder occurrences", () => {
    const body = "<p>{{userName}}</p><span>{{userName}}</span>";
    expect(fillContractTemplate(body, { userName: "张三" })).toBe(
      "<p>张三</p><span>张三</span>",
    );
  });

  it("escapes characters that break double-quoted attributes", () => {
    const body = '<div title="{{userName}}"></div>';
    const out = fillContractTemplate(body, { userName: '"<script>' });
    expect(out).toBe('<div title="&quot;&lt;script&gt;"></div>');
  });
});
