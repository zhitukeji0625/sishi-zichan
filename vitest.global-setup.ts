import { PrismaClient } from "@prisma/client";

/**
 * 集成测试依赖 MySQL/MariaDB。无库时默认跳过相关用例，避免 `npm run test` 直接失败。
 * CI 或本地需强制跑通时设置：VITEST_REQUIRE_DB=1
 */
export default async function globalSetup() {
  const requireDb = process.env.VITEST_REQUIRE_DB === "1";
  const prisma = new PrismaClient();
  const timeoutMs = Number(process.env.VITEST_DB_CONNECT_TIMEOUT_MS ?? "4000");
  const maxAttempts = Number(process.env.VITEST_DB_CONNECT_ATTEMPTS ?? "5");

  let connected = false;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await Promise.race([
        prisma.$connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("connect timeout")), timeoutMs),
        ),
      ]);
      connected = true;
      break;
    } catch (e) {
      lastError = e;
      await prisma.$disconnect().catch(() => {});
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  try {
    if (!connected) throw lastError;
    process.env.VITEST_DB_AVAILABLE = "1";
  } catch {
    if (requireDb) {
      throw new Error(
        "数据库不可用：请启动 MariaDB 并执行 prisma db push，或检查 DATABASE_URL。详见 AGENTS.md。",
      );
    }
    process.env.VITEST_SKIP_DB_TESTS = "1";
    console.warn(
      "[vitest] 跳过数据库集成测试（无法连接 DATABASE_URL）。设置 VITEST_REQUIRE_DB=1 可强制失败。",
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
