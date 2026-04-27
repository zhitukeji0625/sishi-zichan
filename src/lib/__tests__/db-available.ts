import { PrismaClient } from "@prisma/client";

/** 用于集成测试：数据库不可用时跳过，避免 CI 无 MySQL 时整套件失败 */
export async function isPrismaDatabaseReachable(): Promise<boolean> {
  const client = new PrismaClient();
  try {
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect().catch(() => {});
  }
}
