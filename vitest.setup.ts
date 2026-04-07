import { PrismaClient } from "@prisma/client";

declare global {
  var __VITEST_DB_READY__: boolean | undefined;
}

async function probeDatabase(): Promise<boolean> {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

globalThis.__VITEST_DB_READY__ = await probeDatabase();

if (!globalThis.__VITEST_DB_READY__) {
  console.warn(
    "[vitest] 未检测到可用的 MySQL/MariaDB，已跳过需要数据库的集成测试。请启动数据库（例如 docker compose up -d mysql 并映射 3306）后重跑 npm test。",
  );
}
