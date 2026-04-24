import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let available = false;
try {
  await prisma.$connect();
  available = true;
} catch {
  available = false;
} finally {
  await prisma.$disconnect();
}

(globalThis as { __SISHI_DB_AVAILABLE__?: boolean }).__SISHI_DB_AVAILABLE__ =
  available;
