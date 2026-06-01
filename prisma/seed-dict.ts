import { PrismaClient } from "@prisma/client";
import { DICT_CATEGORIES } from "./seed-dict-data";

export async function seedDictCategories(prisma: PrismaClient) {
  for (const cat of DICT_CATEGORIES) {
    const existing = await prisma.dictCategory.findUnique({ where: { code: cat.code } });
    if (existing) continue;
    await prisma.dictCategory.create({
      data: {
        code: cat.code,
        name: cat.name,
        description: "description" in cat ? (cat.description ?? null) : null,
        builtIn: cat.builtIn,
        items: { create: [...cat.items] },
      },
    });
  }
}

async function main() {
  const prisma = new PrismaClient();
  await seedDictCategories(prisma);
  console.log("Dict seed done.");
  await prisma.$disconnect();
}

if (process.argv[1]?.includes("seed-dict")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
