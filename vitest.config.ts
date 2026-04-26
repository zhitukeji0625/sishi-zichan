import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

// 与 README / AGENTS.md 中本地 Docker MariaDB 一致，便于未复制 .env 时跑集成测试
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mysql://root:root@127.0.0.1:3306/sishi";
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = "vitest-session-secret-placeholder-32chars";
}
if (!process.env.THIRD_PARTY_JWT_SECRET) {
  process.env.THIRD_PARTY_JWT_SECRET = "vitest-third-party-jwt-secret-placeholder";
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
