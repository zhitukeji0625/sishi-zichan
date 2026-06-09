import { prisma } from "@/lib/prisma";

export type DictOption = { value: string; label: string };

/** Built-in fallbacks when dict seed has not run yet. */
const BUILTIN_DEFAULTS: Record<string, DictOption[]> = {
  asset_type: [
    { value: "WORKSHOP", label: "厂房" },
    { value: "MACHINERY", label: "农机设备" },
    { value: "FACILITY", label: "农业设施" },
    { value: "LAND", label: "闲置土地" },
    { value: "DRYING_FIELD", label: "晒场" },
    { value: "OTHER", label: "其他" },
  ],
  asset_status: [
    { value: "IDLE", label: "闲置" },
    { value: "IN_USE", label: "在用" },
    { value: "MAINTENANCE", label: "维护中" },
  ],
  auction_status: [
    { value: "DRAFT", label: "草稿" },
    { value: "SCHEDULED", label: "待开始" },
    { value: "LIVE", label: "进行中" },
    { value: "ENDED", label: "已结束" },
    { value: "CANCELLED", label: "已取消" },
  ],
};

export async function getDictItems(categoryCode: string): Promise<DictOption[]> {
  const cat = await prisma.dictCategory.findUnique({
    where: { code: categoryCode },
    include: {
      items: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!cat || cat.items.length === 0) {
    return BUILTIN_DEFAULTS[categoryCode] ?? [];
  }
  return cat.items.map((i) => ({ value: i.value, label: i.label }));
}

export async function getDictLabel(
  categoryCode: string,
  value: string,
): Promise<string> {
  const items = await getDictItems(categoryCode);
  return items.find((i) => i.value === value)?.label ?? value;
}

export async function getDictMap(
  categoryCode: string,
): Promise<Record<string, string>> {
  const items = await getDictItems(categoryCode);
  return Object.fromEntries(items.map((i) => [i.value, i.label]));
}
