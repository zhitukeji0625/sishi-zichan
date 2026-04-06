import { writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const flagPath = path.resolve(__dirname, ".vitest-db-available");

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    writeFileSync(flagPath, "1", "utf8");
  } catch {
    writeFileSync(flagPath, "0", "utf8");
    // eslint-disable-next-line no-console
    console.warn(
      "[vitest] 无法连接 DATABASE_URL，已跳过需数据库的集成测试。可执行: docker compose -f docker-compose.test.yml up -d && npx prisma db push",
    );
  } finally {
    await prisma.$disconnect();
  }
}
