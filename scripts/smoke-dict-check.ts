import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.dictCategory.count();
    if (count === 0) {
      console.log("FAIL: no dict categories");
      return;
    }
    const assetType = await prisma.dictCategory.findUnique({
      where: { code: "asset_type" },
      include: { items: true },
    });
    if (!assetType || assetType.items.length === 0) {
      console.log("FAIL: asset_type missing");
      return;
    }
    const land = assetType.items.find((i) => i.value === "LAND");
    if (!land || land.label !== "闲置土地") {
      console.log(`FAIL: LAND label is ${land?.label ?? "missing"}`);
      return;
    }
    console.log("OK");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
