import { prisma } from "@/lib/prisma";
import {
  adminRoleLabels,
  assetStatusLabels,
  assetTypeLabels,
  orgLevelLabels,
} from "@/lib/labels";

export type DictOption = { value: string; label: string };

const labelFallbacks: Record<string, Record<string, string>> = {
  asset_type: assetTypeLabels,
  asset_status: assetStatusLabels,
  org_level: orgLevelLabels,
  admin_role: adminRoleLabels,
};

function fallbackDictItems(categoryCode: string): DictOption[] {
  const labels = labelFallbacks[categoryCode];
  if (!labels) return [];
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

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
    return fallbackDictItems(categoryCode);
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
