import { PrismaClient } from "@prisma/client";

/**
 * 集成测试依赖 MySQL/MariaDB。无库时默认跳过相关用例，避免 `npm run test` 直接失败。
 * CI 或本地需强制跑通时设置：VITEST_REQUIRE_DB=1
 */
export default async function globalSetup() {
  const requireDb = process.env.VITEST_REQUIRE_DB === "1";
  const prisma = new PrismaClient();
  const timeoutMs = Number(process.env.VITEST_DB_CONNECT_TIMEOUT_MS ?? "10000");
  const retries = Number(process.env.VITEST_DB_CONNECT_RETRIES ?? "3");
  const retryDelayMs = Number(process.env.VITEST_DB_CONNECT_RETRY_DELAY_MS ?? "1500");

  let connected = false;
  let lastError: unknown;

  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
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
        if (attempt < retries) await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }

    if (connected) {
      process.env.VITEST_DB_AVAILABLE = "1";
    } else if (requireDb) {
      const detail = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(
        `数据库不可用（${detail}）：请启动 MariaDB 并执行 prisma db push，或检查 DATABASE_URL。详见 AGENTS.md。`,
      );
    } else {
      process.env.VITEST_SKIP_DB_TESTS = "1";
      console.warn(
        "[vitest] 跳过数据库集成测试（无法连接 DATABASE_URL）。设置 VITEST_REQUIRE_DB=1 可强制失败。",
      );
    }
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
