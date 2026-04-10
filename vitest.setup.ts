import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();
dotenv.config({ path: ".env.example" });

const prisma = new PrismaClient();
try {
  await prisma.$connect();
  process.env.VITEST_DB_READY = "1";
} catch {
  process.env.VITEST_DB_READY = "0";
} finally {
  await prisma.$disconnect();
}
