import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import path from "path";

// 与 README / AGENTS.md 中 Docker MariaDB 默认一致；CI 或未复制 .env 时仍可进行需库的集成测试
loadEnv();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mysql://root:root@127.0.0.1:3306/sishi";
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
