/**
 * @param {Array<{ id: string; value: number }>} items
 * @returns {{ count: number; total: number }}
 */
export function summarizeItems(items) {
  if (!Array.isArray(items)) {
    throw new TypeError("items must be an array");
  }
  let total = 0;
  for (const item of items) {
    if (item == null || typeof item.value !== "number" || Number.isNaN(item.value)) {
      throw new TypeError("each item must have a numeric value");
    }
    total += item.value;
  }
  return { count: items.length, total };
}
