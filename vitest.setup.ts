import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * 在每个测试 worker 内检测数据库；不可用时设置 VITEST_SKIP_DB_TESTS。
 * globalSetup 运行在独立进程，环境变量不会自动传入 worker。
 */
const requireDb = process.env.VITEST_REQUIRE_DB === "1";
const timeoutMs = Number(process.env.VITEST_DB_CONNECT_TIMEOUT_MS ?? "4000");

const prisma = new PrismaClient();

try {
  await Promise.race([
    prisma.$connect(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("connect timeout")), timeoutMs),
    ),
  ]);
  if (process.env.VITEST_SKIP_DB_PUSH !== "1") {
    execSync("npx prisma db push --skip-generate", {
      stdio: "pipe",
      env: process.env,
    });
  }
  process.env.VITEST_DB_AVAILABLE = "1";
} catch (err) {
  if (requireDb) {
    throw new Error(
      `数据库不可用：请启动 MariaDB 并检查 DATABASE_URL。${err instanceof Error ? err.message : ""}`,
    );
  }
  process.env.VITEST_SKIP_DB_TESTS = "1";
  console.warn(
    "[vitest] 跳过数据库集成测试（无法连接或同步 schema）。设置 VITEST_REQUIRE_DB=1 可强制失败。",
  );
} finally {
  await prisma.$disconnect().catch(() => {});
}
