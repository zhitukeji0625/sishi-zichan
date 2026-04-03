import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

loadEnv({ path: path.resolve(__dirname, ".env"), quiet: true });
// 集成测试需要数据库；与 AGENTS.md 中 Docker MariaDB 默认一致，便于未复制 .env 时本地运行
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    "mysql://root:root@127.0.0.1:3306/sishi";
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: [path.resolve(__dirname, "vitest.global-setup.ts")],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
