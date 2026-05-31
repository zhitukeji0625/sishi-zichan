import { PrismaClient } from "@prisma/client";
import { seedDict } from "./seed-dict-data";

const prisma = new PrismaClient();

async function main() {
  const created = await seedDict(prisma);
  console.log(created > 0 ? `Dict seed OK (${created} categories).` : "Dict seed: all categories present.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
