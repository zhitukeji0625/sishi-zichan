import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

loadEnv({ path: path.resolve(__dirname, ".env"), quiet: true });

const dockerMariaDbUrl =
  process.env.TEST_DATABASE_URL ??
  "mysql://root:root@127.0.0.1:3306/sishi";
/** `.env.example` 占位凭据；与 AGENTS.md / docker-compose 本地库不一致时测试应连 Docker 默认库 */
const placeholderDatabaseUrl = "mysql://user:password@127.0.0.1:3306/sishi";

// 集成测试需要数据库；与 AGENTS.md 中 Docker MariaDB 默认一致
if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL === placeholderDatabaseUrl
) {
  process.env.DATABASE_URL = dockerMariaDbUrl;
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
