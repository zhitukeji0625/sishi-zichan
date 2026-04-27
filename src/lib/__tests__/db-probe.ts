import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

let dbAvailable = false;
try {
  await prisma.$queryRaw(Prisma.sql`SELECT 1`);
  dbAvailable = true;
} catch {
  dbAvailable = false;
} finally {
  await prisma.$disconnect();
}

export { dbAvailable };
