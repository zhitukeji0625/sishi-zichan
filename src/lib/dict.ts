import { prisma } from "@/lib/prisma";
import {
  assetTypeLabels,
  assetStatusLabels,
  adminRoleLabels,
  orgLevelLabels,
} from "@/lib/labels";

export type DictOption = { value: string; label: string };

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
    return getBuiltinDictItems(categoryCode);
  }
  return cat.items.map((i) => ({ value: i.value, label: i.label }));
}

/** 字典未初始化时的内置回退选项 */
function getBuiltinDictItems(categoryCode: string): DictOption[] {
  const maps: Record<string, Record<string, string>> = {
    asset_type: assetTypeLabels,
    asset_status: assetStatusLabels,
    admin_role: adminRoleLabels,
    org_level: orgLevelLabels,
  };
  const labels = maps[categoryCode];
  if (!labels) return [];
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
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
