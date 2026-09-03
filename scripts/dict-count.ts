import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
prisma.dictCategory
  .count()
  .then((count) => {
    console.log(count);
    return prisma.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
