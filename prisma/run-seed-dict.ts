import { PrismaClient } from "@prisma/client";
import { seedDictCategories } from "./seed-dict";

const prisma = new PrismaClient();

seedDictCategories(prisma)
  .then(() => {
    console.log("Dict seed done.");
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
