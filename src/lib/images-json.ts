/** 解析资产存库的 JSON 图片列表；解析失败或非数组时返回空数组（不在渲染路径上用 try/catch 包 JSX）。 */
export function parseImageUrlsFromJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((u): u is string => typeof u === "string")
      : [];
  } catch {
    return [];
  }
}
