import { PrismaClient } from "@prisma/client";
import { seedDict } from "./seed-dict-lib";

const prisma = new PrismaClient();

async function main() {
  await seedDict(prisma);
  console.log("Dict seed done.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
