import { PrismaClient } from "@prisma/client";
import { seedDictCategories } from "./seed-dict-data";

const prisma = new PrismaClient();

async function main() {
  await seedDictCategories(prisma);
  console.log("Dict seed done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
