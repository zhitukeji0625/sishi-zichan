import { PrismaClient } from "@prisma/client";
import { seedDict } from "./seed-dict";

const prisma = new PrismaClient();
seedDict(prisma)
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
