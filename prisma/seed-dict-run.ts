import { PrismaClient } from "@prisma/client";
import { seedDict } from "./seed-dict";

const prisma = new PrismaClient();

seedDict(prisma)
  .then(() => {
    console.log("Dict seed done.");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
