import type { PrismaClient } from "@prisma/client";
import { BUILTIN_DICT_CATEGORIES } from "../src/lib/dict-defaults";

/** Idempotently seed built-in dictionary categories (always safe to re-run). */
export async function seedDict(prisma: PrismaClient) {
  for (const [code, { name, labels }] of Object.entries(BUILTIN_DICT_CATEGORIES)) {
    const category = await prisma.dictCategory.upsert({
      where: { code },
      update: { name, builtIn: true },
      create: { code, name, builtIn: true, description: "系统内置字典" },
    });
    let order = 0;
    for (const [value, label] of Object.entries(labels)) {
      await prisma.dictItem.upsert({
        where: { categoryId_value: { categoryId: category.id, value } },
        update: { label, sortOrder: order, enabled: true },
        create: {
          categoryId: category.id,
          value,
          label,
          sortOrder: order,
          enabled: true,
        },
      });
      order += 1;
    }
  }
}
