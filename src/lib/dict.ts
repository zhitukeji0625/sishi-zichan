import { prisma } from "@/lib/prisma";
import { builtinDictFallbacks } from "@/lib/labels";

export type DictOption = { value: string; label: string };

function fallbackItems(categoryCode: string): DictOption[] {
  const map = builtinDictFallbacks[categoryCode];
  if (!map) return [];
  return Object.entries(map).map(([value, label]) => ({ value, label }));
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
  if (cat && cat.items.length > 0) {
    return cat.items.map((i) => ({ value: i.value, label: i.label }));
  }
  return fallbackItems(categoryCode);
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
