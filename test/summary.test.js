import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeItems } from "../src/summary.js";

describe("summarizeItems", () => {
  it("returns zero totals for empty list", () => {
    assert.deepEqual(summarizeItems([]), { count: 0, total: 0 });
  });

  it("sums values and counts items", () => {
    assert.deepEqual(
      summarizeItems([
        { id: "a", value: 10 },
        { id: "b", value: 5.5 },
      ]),
      { count: 2, total: 15.5 },
    );
  });

  it("rejects non-array input", () => {
    assert.throws(() => summarizeItems(null), TypeError);
    assert.throws(() => summarizeItems({}), TypeError);
  });

  it("rejects invalid item values", () => {
    assert.throws(() => summarizeItems([{ id: "x" }]), TypeError);
    assert.throws(() => summarizeItems([{ id: "x", value: NaN }]), TypeError);
  });
});
