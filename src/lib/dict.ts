import { prisma } from "@/lib/prisma";
import { builtinDictItems, builtinDictMap } from "@/lib/dict-defaults";

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
    return builtinDictItems(categoryCode);
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
  if (items.length > 0) {
    return Object.fromEntries(items.map((i) => [i.value, i.label]));
  }
  return builtinDictMap(categoryCode);
}
